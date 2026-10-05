import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { LandingQuestionnaireService } from '../../services/landing-questionnaire.service';
import { InvitationMediaService } from '../../services/invitation-media.service';
import { PaymentService } from '../../services/payment.service';
import {
  LandingQuestionnaireComponent,
  LandingQuestionnaireValue,
} from '../landing-questionnaire/landing-questionnaire.component';
import type { StripePaymentElement } from '@stripe/stripe-js';

type UsernameStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'unavailable'
  | 'server_error';

const MAX_COVER_FILE_SIZE = 10 * 1024 * 1024;
const MAX_COVER_PIXELS = 20_000_000;
const MAX_COVER_DIMENSION = 2560;
const MAX_UPLOAD_BYTES = 1_500_000;
const MAX_UPLOAD_PIXELS = 12_000_000;
const MAX_UPLOAD_DIMENSION = 1800;

type ImageKind = 'jpeg' | 'png' | 'webp';

export async function detectImageKind(file: File): Promise<ImageKind | null> {
  const lowerType = file.type.toLowerCase();
  if (lowerType === 'image/jpeg' || lowerType === 'image/jpg') return 'jpeg';
  if (lowerType === 'image/png') return 'png';
  if (lowerType === 'image/webp') return 'webp';

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const png =
    header[0] === 0x89 &&
    header[1] === 0x50 &&
    header[2] === 0x4e &&
    header[3] === 0x47 &&
    header[4] === 0x0d &&
    header[5] === 0x0a &&
    header[6] === 0x1a &&
    header[7] === 0x0a;
  const webp =
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x45 &&
    header[10] === 0x42 &&
    header[11] === 0x50;

  return jpeg ? 'jpeg' : png ? 'png' : webp ? 'webp' : null;
}

/**
 * Flujo de registro (4 pasos):
 *
 *   1. Datos básicos (nombres, username, email, password).
 *      Botón → "Continuar" (antes "Continuar al pago").
 *   2. Cuestionario inicial de la landing (fecha, invitados, color,
 *      servicios extra, etc.). Se guarda asociado al usuario recién
 *      creado en el mismo submit.
 *   3. Pago con Stripe (Payment Element). Si el backend no tiene
 *      Stripe configurado, se muestra el modo demo anterior para no
 *      bloquear el desarrollo local sin claves.
 *   4. Éxito → "Ir a mi Panel de Control".
 */
@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CommonModule, LandingQuestionnaireComponent],
})
export class RegisterComponent {
  constructor() {
    /**
     * `effect` que monta/desmonta el Payment Element cuando el
     * contenedor DOM está disponible y `paymentMode === 'ready'`.
     *
     * Lo declaramos en el constructor (no como campo) para
     * garantizar que `paymentService` y los demás campos ya estén
     * inicializados cuando el callback se ejecute.
     */
    effect(() => {
      const step = this.step();
      const mode = this.paymentMode();
      const container =
        this.paymentElementContainer()?.nativeElement ?? null;

      // Solo nos interesa el momento en que estamos en paso 3 con
      // Stripe listo. En cualquier otro caso, desmontamos.
      if (step !== 3) {
        if (this.mountedPaymentElement) {
          this.paymentService.destroyElements();
          this.mountedPaymentElement = null;
        }
        return;
      }

      if (mode !== 'ready' || !container) return;

      // Si ya tenemos un Element montado, no lo recreamos (Stripe
      // se quejaría con "this element is already mounted").
      if (this.mountedPaymentElement) return;

      this.mountedPaymentElement =
        this.paymentService.mountPaymentElement(container);
    });
  }
  protected readonly step = signal<1 | 2 | 3 | 4>(1);
  protected readonly processing = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly createdSlug = signal<string | null>(null);
  protected readonly paymentProcessing = signal(false);
  protected readonly paymentError = signal<string | null>(null);

  /**
   * Estado del checkout real (Stripe):
   *  - `loading`   → estamos creando el PaymentIntent / montando el Element.
   *  - `ready`     → el Payment Element está montado y listo para pagar.
   *  - `unavailable`  → el backend no tiene Stripe configurado: mostrar demo.
   *  - `error`     → falló la inicialización (red, claves inválidas, etc.).
   */
  protected readonly paymentMode = signal<
    'loading' | 'ready' | 'unavailable' | 'error'
  >('loading');
  protected readonly paymentAmountMajor = signal<string>('59,00');
  protected readonly paymentCurrency = signal<string>('eur');

  // ── Estado del código de descuento ────────────────────────────
  /**
   * Texto crudo del input. NO se valida automáticamente: el usuario
   * pulsa "Aplicar" (o Enter) y entonces llamamos al backend. Eso
   * evita llamadas extra mientras el usuario todavía está tecleando.
   */
  protected readonly discountCodeInput = signal<string>('');
  /** Detalle del descuento ya validado y aplicado al PaymentIntent. */
  protected readonly appliedDiscount = signal<
    import('../../../types/api').AppliedDiscount | null
  >(null);
  /** Precio original (en céntimos) antes de aplicar el descuento. */
  protected readonly baseAmountCents = signal<number>(0);
  /** Mensaje de error cuando el cupón NO es válido. */
  protected readonly discountError = signal<string | null>(null);
  /** `true` mientras dura la llamada a `validate-discount`. */
  protected readonly discountProcessing = signal<boolean>(false);

  /**
   * Handler `(input)` del campo de código. Usamos un método en vez de
   * `[(ngModel)]` para mantener el control en signals sin meter
   * `FormsModule` extra en el template.
   */
  protected onDiscountCodeInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.discountCodeInput.set(target?.value ?? '');
    // Si el usuario vuelve a escribir, limpiamos el error anterior.
    if (this.discountError()) this.discountError.set(null);
  }

  /**
   * Contenedor donde Stripe monta el Payment Element. Lo declaramos
   * como `viewChild` para poder pasárselo al servicio cuando entremos
   * en el paso 3.
   */
  private readonly paymentElementContainer =
    viewChild<ElementRef<HTMLDivElement>>('paymentElement');

  private mountedPaymentElement: StripePaymentElement | null = null;

  protected readonly usernameStatus = signal<UsernameStatus>('idle');
  protected readonly usernameMessage = signal<string | null>(null);

  /**
   * Si la subida de la galería falla después de crear la cuenta, seguimos
   * al paso 3 pero marcamos este flag para mostrar un aviso al usuario.
   */
  protected readonly galleryUploadError = signal<boolean>(false);

  /**
   * Igual para las fotos de "Nuestra historia": si fallan al subirse,
   * seguimos al paso 3 pero dejamos aviso para que el cliente sepa que
   * no quedaron persistidas.
   */
  protected readonly ourStoryUploadError = signal<boolean>(false);

  protected readonly coverUploadError = signal<boolean>(false);

  protected formData = {
    username: '',
    email: '',
    password: '',
  };

  /**
   * Estado inicial del cuestionario en el paso 2. Lo guardamos en
   * una signal para que el `landing-questionnaire` se pueda rehidratar
   * si el usuario vuelve atrás.
   */
  protected readonly questionnaireValue = signal<LandingQuestionnaireValue>({
    weddingDate: '',
    estimatedGuests: null,
    predominantColor: '',
    hasCountdown: true,
    hasBusService: false,
    hasHotelService: false,
    hasCoverPhoto: false,
    coverPhoto: { existingUrl: null, file: null },
    hasOurStory: false,
    ourStoryPhotos: [],
    hasGallery: false,
    galleryFiles: [],
    galleryExistingUrls: [],
    hasAddToCalendar: false,
    hasVenueMap: false,
    hasGiftRegistry: false,
    giftBankAccount: '',
    hasBackgroundMusic: false,
    backgroundMusicSong: '',
    contactCouple: false,
    contactGroomPhone: '',
    contactBridePhone: '',
    additionalServices: '',
    notes: '',
  });

  private authService = inject(AuthService);
  private questionnaireService = inject(LandingQuestionnaireService);
  private invitationMediaService = inject(InvitationMediaService);
  private paymentService = inject(PaymentService);
  private router = inject(Router);

  /**
   * Paso 1 → 2. Valida los datos básicos y consulta si el username
   * está libre antes de dejar avanzar al cuestionario.
   */
  goToQuestionnaire() {
    this.errorMessage.set(null);
    this.usernameMessage.set(null);

    if (
      !this.formData.username ||
      !this.formData.email ||
      !this.formData.password
    ) {
      this.errorMessage.set('Rellena todos los campos para continuar.');
      return;
    }
    if (this.formData.password.length < 8) {
      this.errorMessage.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (this.formData.username.trim().length < 3) {
      this.errorMessage.set('El nombre de usuario debe tener al menos 3 caracteres.');
      return;
    }

    this.usernameStatus.set('checking');
    this.usernameMessage.set('Comprobando disponibilidad…');

    this.authService
      .checkUsername(this.formData.username)
      .subscribe({
        next: (response) => {
          if (response?.available) {
            this.usernameStatus.set('available');
            this.usernameMessage.set('¡Nombre disponible!');
            this.step.set(2);
            return;
          }
          this.usernameStatus.set('unavailable');
          this.usernameMessage.set(
            'Este nombre de usuario no está disponible. Prueba con otro.',
          );
        },
        error: (err: HttpErrorResponse) => {
          console.error('[register] checkUsername error:', err);
          this.usernameStatus.set('server_error');
          this.usernameMessage.set(
            'No pudimos comprobar la disponibilidad. Inténtalo de nuevo.',
          );
        },
      });
  }

  /**
   * Paso 2 → backend. Crea la cuenta del usuario y, si el backend
   * responde bien, sube la galería de fotos (si aplica) y guarda el
   * cuestionario asociado. Si algo falla después de crear la cuenta,
   * NO abortamos el flujo (la cuenta existe y el admin puede pedir
   * las respuestas/fotos más tarde), pero sí informamos al usuario
   * en el paso 3.
   */
  async onQuestionnaireSubmitted(submission: {
    value: LandingQuestionnaireValue;
    ourStoryPhotosToDelete: string[];
  }) {
    const value = submission.value;

    if (this.processing()) return;

    this.questionnaireValue.set(value);
    this.errorMessage.set(null);
    this.galleryUploadError.set(false);
    this.ourStoryUploadError.set(false);
    this.coverUploadError.set(false);
    this.processing.set(true);

    try {
      const response = await new Promise<{ slug: string }>((resolve, reject) => {
        this.authService
          .register({
            username: this.formData.username,
            email: this.formData.email,
            password: this.formData.password,
            estimatedGuests: value.estimatedGuests,
          })
          .subscribe({
            next: (r) => resolve({ slug: r.user.slug }),
            error: (err: HttpErrorResponse) => reject(err),
          });
      });

      if (value.hasCoverPhoto && value.coverPhoto.file) {
        try {
          const coverBlob = await this.prepareCoverPhoto(value.coverPhoto.file);
          if (!coverBlob) throw new Error('Invalid cover photo');
          await firstValueFrom(this.invitationMediaService.uploadCover(coverBlob));
        } catch (uploadErr) {
          console.error('[register] cover upload failed:', uploadErr);
          this.coverUploadError.set(true);
        }
      }

      // Cuenta creada. Si el cliente marcó "Nuestra historia" y seleccionó
      // fotos, las subimos antes del cuestionario. Como el endpoint
      // requiere JWT, esto solo funciona ahora que la cuenta ya existe.
      let uploadedOurStoryUrls: string[] = [];
      if (value.hasOurStory) {
        const filesToUpload = value.ourStoryPhotos
          .map((p) => p.file)
          .filter((f): f is File => f !== null);
        if (filesToUpload.length > 0) {
          try {
            const preparedFiles = await this.prepareUploadImages(filesToUpload, MAX_UPLOAD_BYTES);
            if (preparedFiles.length > 0) {
              // El backend devuelve las URLs en el mismo orden en que se
              // enviaron los archivos: capturamos ese orden para asociar
              // cada URL con su caption en `ourStoryPhotos`.
              uploadedOurStoryUrls = await firstValueFrom(
                this.invitationMediaService.uploadHistory(preparedFiles),
              );
            }
          } catch (uploadErr) {
            console.error('[register] our-story upload failed:', uploadErr);
            this.ourStoryUploadError.set(true);
          }
        }
      }

      // Cuenta creada. Si el cliente marcó "Galería de fotos" y seleccionó
      // alguna, las subimos antes del cuestionario. Como el endpoint
      // requiere JWT, esto solo funciona ahora que la cuenta ya existe.
      if (value.hasGallery && value.galleryFiles.length > 0) {
        try {
          const preparedGalleryFiles = await this.prepareUploadImages(
            value.galleryFiles,
            MAX_UPLOAD_BYTES,
          );
          if (preparedGalleryFiles.length > 0) {
            await firstValueFrom(
              this.invitationMediaService.uploadGallery(preparedGalleryFiles),
            );
          }
        } catch (uploadErr) {
          console.error('[register] gallery upload failed:', uploadErr);
          this.galleryUploadError.set(true);
        }
      }

      // Construimos el array de entries {url, caption} alineado con el
      // orden en que se subieron las fotos. Si la subida falló, no
      // tendremos URLs y guardamos null (el admin verá el aviso).
      const ourStoryEntries =
        value.hasOurStory && uploadedOurStoryUrls.length > 0
          ? value.ourStoryPhotos
              .filter((p) => p.file !== null)
              .map((p, idx) => ({
                url: uploadedOurStoryUrls[idx] ?? '',
                caption: p.caption.trim(),
              }))
              .filter((e) => e.url.length > 0)
          : [];

      // Intentamos guardar el cuestionario; si falla, seguimos al paso 3
      // igualmente (mejor onboarding parcial que obligar al cliente a
      // volver a registrarse).
      try {
        await this.questionnaireService.save({
          weddingDate: value.weddingDate || null,
          estimatedGuests: value.estimatedGuests,
          predominantColor: value.predominantColor || null,
          hasCountdown: value.hasCountdown,
          hasBusService: value.hasBusService,
          hasHotelService: value.hasHotelService,
          hasCoverPhoto: value.hasCoverPhoto,
          hasOurStory: value.hasOurStory,
          hasGallery: value.hasGallery,
          hasAddToCalendar: value.hasAddToCalendar,
          hasVenueMap: value.hasVenueMap,
          hasGiftRegistry: value.hasGiftRegistry,
          giftBankAccount: value.giftBankAccount.trim() || null,
          hasBackgroundMusic: value.hasBackgroundMusic,
          backgroundMusicSong: value.backgroundMusicSong.trim() || null,
          ourStoryEntries: ourStoryEntries.length > 0 ? JSON.stringify(ourStoryEntries) : null,
          contactCouple: value.contactCouple,
          contactGroomPhone: value.contactGroomPhone.trim() || null,
          contactBridePhone: value.contactBridePhone.trim() || null,
          additionalServices: value.additionalServices.trim() || null,
          notes: value.notes.trim() || null,
        });
      } catch (qErr) {
        console.error('[register] questionnaire save failed:', qErr);
        // Marcar para mostrar aviso en el paso 3.
        this.errorMessage.set(
          'Tu cuenta se ha creado, pero no pudimos guardar el cuestionario. ' +
            'Podrás volver a enviarlo desde tu panel.',
        );
      }

      this.createdSlug.set(response.slug);
      this.processing.set(false);
      this.step.set(3);
      // Disparamos la inicialización del checkout de Stripe fuera del
      // try/catch: un fallo aquí NO debe impedir mostrar el paso 3
      // (caeríamos al modo demo).
      void this.initializePayment();
    } catch (err: unknown) {
      this.processing.set(false);
      console.error('[register] register error:', err);
      const httpErr = err as HttpErrorResponse;
      const backendMessage =
        (httpErr?.error && (httpErr.error.message || httpErr.error.error)) || '';
      this.errorMessage.set(
        backendMessage ||
          'No pudimos crear tu boda. Inténtalo de nuevo en unos segundos.',
      );
    }
  }

  goToDashboard() {
    const slug = this.createdSlug() ?? this.formData.username;
    this.router.navigate([`/${slug}/dashboard`]);
  }

  /**
   * Inicializa el checkout de Stripe al entrar en el paso 3.
   *
   * Pasos:
   *  1. Pedir `/api/payments/config` para saber si Stripe está activo.
   *  2. Si no → `paymentMode = 'unavailable'` (mostramos demo).
   *  3. Si sí → cargar Stripe.js, crear PaymentIntent, montar Elements.
   *     `paymentMode` pasa a `'ready'` y el `effect` del constructor se
   *     encarga de montar el Payment Element cuando el contenedor
   *     DOM esté disponible.
   *
   * Si algo falla (red, claves inválidas), pasamos a `'error'` o
   * `'unavailable'` según el punto de fallo, para no bloquear al
   * usuario: el admin siempre puede actualizar `paidAt` manualmente.
   */
  private async initializePayment(): Promise<void> {
    this.paymentMode.set('loading');
    this.paymentError.set(null);
    this.appliedDiscount.set(null);
    this.discountError.set(null);

    try {
      const cfg = await this.paymentService.loadConfig();

      // Guardamos el importe base en céntimos (lo usa la lógica del
      // cupón para mostrar el "antes/después").
      const baseCents = cfg.amount ?? 0;
      this.baseAmountCents.set(baseCents);

      // Para mostrar el importe formateado en el summary.
      const amount = baseCents / 100;
      this.paymentAmountMajor.set(
        amount.toLocaleString('es-ES', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      );
      this.paymentCurrency.set((cfg.currency || 'eur').toUpperCase());

      if (!cfg.enabled || !cfg.publishableKey) {
        this.paymentMode.set('unavailable');
        return;
      }

      const intent = await this.createOrReplaceIntent();
      if (!intent || !intent.clientSecret) {
        this.paymentMode.set('unavailable');
        this.paymentError.set(
          'No pudimos cargar el formulario de pago seguro. ' +
            'Continúa en modo demo.',
        );
        return;
      }

      const elements = await this.paymentService.createElements(
        intent.clientSecret,
      );

      if (!elements) {
        this.paymentMode.set('unavailable');
        this.paymentError.set(
          'No pudimos cargar el formulario de pago seguro. ' +
            'Continúa en modo demo.',
        );
        return;
      }

      this.paymentMode.set('ready');
    } catch (err) {
      console.error('[register] initializePayment error:', err);
      this.paymentMode.set('unavailable');
      this.paymentError.set(
        'No pudimos conectar con el servicio de pagos. ' +
          'Continúa en modo demo.',
      );
    }
  }

  /**
   * Crea (o reemplaza) el PaymentIntent pasándole el código de
   * descuento que esté actualmente aplicado. Centraliza la llamada
   * para que cualquier cambio de cupón pase por el mismo punto.
   *
   * Si el backend responde con `valid:false` (cupón inválido),
   * limpiamos el cupón aplicado y devolvemos `null` para que el
   * caller decida qué hacer.
   */
  private async createOrReplaceIntent(): Promise<
    import('../../../types/api').PaymentIntentResponse | null
  > {
    const applied = this.appliedDiscount();
    const code = applied?.code ?? null;

    const intent = await this.paymentService.createIntent(code);

    if (intent && intent.valid === false) {
      // El cupón que tenía aplicado el usuario ya no es válido
      // (pudo expirar entre tanto). Limpiamos y recreamos sin él.
      this.appliedDiscount.set(null);
      this.discountError.set(
        intent.message ??
          'El código ya no es válido. Introdúcelo de nuevo o continúa sin él.',
      );
      this.discountCodeInput.set('');
      const retry = await this.paymentService.createIntent(null);
      return retry ?? null;
    }

    if (intent?.discount) {
      this.appliedDiscount.set(intent.discount);
      this.refreshDisplayedAmountDisplay();
    } else {
      this.appliedDiscount.set(null);
      this.refreshDisplayedAmountDisplay();
    }
    return intent;
  }

  /**
   * Llama al endpoint `/validate-discount`. Si es válido, lo aplica
   * (re-creando el PaymentIntent). Si no, muestra el error inline.
   */
  protected async applyDiscountCode(): Promise<void> {
    if (this.discountProcessing()) return;
    const code = this.discountCodeInput().trim();
    if (!code) {
      this.discountError.set('Introduce un código antes de pulsar Aplicar.');
      return;
    }

    this.discountProcessing.set(true);
    this.discountError.set(null);
    try {
      // 1) Validamos sin tocar el intent (más barato, evita "ensuciar"
      //    la DB con intents rechazados si el código era malo).
      const validation = await this.paymentService.validateDiscountCode(code);
      if (!validation || validation.valid !== true) {
        this.discountError.set(
          validation?.message ??
            'El código no es válido, está inactivo o ha expirado.',
        );
        return;
      }

      // 2) Aplicamos: guardamos el descuento y recreamos el intent
      //    con el código. El importe que verá Stripe será el `final`.
      this.appliedDiscount.set({
        code: validation.code ?? code.toUpperCase(),
        percent: validation.percent ?? 0,
        originalAmountCents:
          validation.originalAmountCents ?? this.baseAmountCents(),
        savingsCents: validation.savingsCents ?? 0,
        finalAmountCents: validation.finalAmountCents ?? this.baseAmountCents(),
        description: validation.description ?? null,
        expiresAt: validation.expiresAt ?? null,
      });

      // Re-creamos el PaymentIntent. Si Stripe ya está montado,
      // necesitamos desmontar primero para poder pasar un nuevo
      // clientSecret al `Elements`.
      this.paymentService.destroyElements();
      this.mountedPaymentElement = null;
      this.paymentMode.set('loading');

      const intent = await this.paymentService.createIntent(
        this.appliedDiscount()?.code ?? null,
      );

      if (intent?.valid === false) {
        this.appliedDiscount.set(null);
        this.discountError.set(
          intent.message ?? 'El código no es válido.',
        );
        this.discountCodeInput.set('');
        this.paymentMode.set('ready');
        // Restauramos Elements sin descuento
        const retry = await this.paymentService.createIntent(null);
        if (retry && retry.clientSecret) {
          const elements = await this.paymentService.createElements(
            retry.clientSecret,
          );
          if (elements) this.paymentMode.set('ready');
        }
        return;
      }

      if (intent?.discount) {
        // El backend manda el descuento re-calculado por si acaso.
        this.appliedDiscount.set(intent.discount);
      }

      const elements = intent?.clientSecret
        ? await this.paymentService.createElements(intent.clientSecret)
        : null;
      if (!elements) {
        this.paymentMode.set('unavailable');
        this.paymentError.set(
          'No pudimos recargar el formulario de pago. Inténtalo de nuevo.',
        );
        return;
      }
      this.paymentMode.set('ready');
      this.refreshDisplayedAmountDisplay();
    } catch (err) {
      console.error('[register] applyDiscountCode error:', err);
      this.discountError.set(
        'No pudimos comprobar el código. Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      this.discountProcessing.set(false);
    }
  }

  /**
   * Quita el cupón aplicado: limpia el input, el descuento aplicado
   * y recrea el PaymentIntent al precio original.
   */
  protected async clearDiscountCode(): Promise<void> {
    if (!this.appliedDiscount() && !this.discountCodeInput()) return;
    this.discountCodeInput.set('');
    this.appliedDiscount.set(null);
    this.discountError.set(null);
    this.paymentMode.set('loading');
    try {
      this.paymentService.destroyElements();
      this.mountedPaymentElement = null;
      const intent = await this.paymentService.createIntent(null);
      if (intent?.clientSecret) {
        const elements = await this.paymentService.createElements(
          intent.clientSecret,
        );
        if (!elements) {
          this.paymentMode.set('unavailable');
          this.paymentError.set(
            'No pudimos recargar el formulario de pago. Inténtalo de nuevo.',
          );
          return;
        }
        this.paymentMode.set('ready');
      }
      this.refreshDisplayedAmountDisplay();
    } catch (err) {
      console.error('[register] clearDiscountCode error:', err);
      this.paymentMode.set('unavailable');
    }
  }

  /**
   * Actualiza `paymentAmountMajor` para reflejar el precio con o sin
   * descuento (lo que el usuario VE en el resumen). NO toca Stripe:
   * Stripe ya tiene el precio correcto en el PaymentIntent.
   */
  private refreshDisplayedAmountDisplay(): void {
    const applied = this.appliedDiscount();
    const finalCents = applied?.finalAmountCents ?? this.baseAmountCents();
    this.paymentAmountMajor.set(
      (finalCents / 100).toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    );
  }

  /**
   * Confirmar el pago.
   *
   *   - En modo live (`ready`): llama a `confirmPayment` de Stripe.
   *     Si devuelve `succeeded`, avanzamos al paso 4. Si requiere
   *     3DS, Stripe redirige al challenge (el `return_url` apunta
   *     a esta misma página con un query param que reactivaría el
   *     flujo). El webhook `payment_intent.succeeded` es la fuente
   *     de verdad: aunque el navegador se cierre, marcamos al user.
   *
   *   - En modo demo (`unavailable`): simulación local con timeout.
   *     NO crea ningún PaymentIntent ni llama al backend.
   */
  async completePayment(): Promise<void> {
    if (this.paymentProcessing()) return;

    this.paymentError.set(null);
    this.paymentProcessing.set(true);

    if (this.paymentMode() === 'ready') {
      try {
        const returnUrl = `${window.location.origin}/register?payment=return`;
        const result = await this.paymentService.confirmPayment(returnUrl);

        if (result.status === 'succeeded') {
          // Marcamos `paidAt` optimistamente: el guard del dashboard
          // lo consultará al navegar y no nos devolverá a /complete-payment.
          this.authService.markAsPaid();
          this.paymentProcessing.set(false);
          this.paymentService.destroyElements();
          this.step.set(4);
          return;
        }

        if (result.status === 'processing') {
          // Algunos bancos tardan en confirmar. Le decimos al usuario
          // que espere: el webhook actualizará el panel cuando llegue.
          this.paymentProcessing.set(false);
          this.paymentError.set(
            'Tu banco está procesando el pago. Te avisaremos en cuanto se confirme.',
          );
          return;
        }

        // failed u otros: mostramos el mensaje de Stripe.
        this.paymentProcessing.set(false);
        this.paymentError.set(
          result.error ||
            'El pago no se completó. Revisa los datos e inténtalo de nuevo.',
        );
        return;
      } catch (err) {
        console.error('[register] confirmPayment error:', err);
        this.paymentProcessing.set(false);
        this.paymentError.set(
          'No pudimos procesar el pago. Inténtalo de nuevo en unos segundos.',
        );
        return;
      }
    }

    // Modo demo (Stripe no configurado): simulación local.
    window.setTimeout(() => {
      this.authService.markAsPaid();
      this.paymentProcessing.set(false);
      this.step.set(4);
    }, 700);
  }

  /**
   * Vuelve del paso 2 al 1. Resetea el feedback del username para
   * que no aparezca "¡Nombre disponible!" al regresar.
   */
  goBackToForm() {
    this.errorMessage.set(null);
    this.usernameStatus.set('idle');
    this.usernameMessage.set(null);
    this.step.set(1);
  }

  private async prepareUploadImages(files: File[], maxBytes: number): Promise<Blob[]> {
    const prepared = await Promise.all(
      files.map((file) => this.prepareImageForUpload(file, maxBytes)),
    );
    return prepared.filter((blob): blob is Blob => blob !== null);
  }

  private async prepareImageForUpload(file: File, maxBytes: number): Promise<Blob | null> {
    if (file.size === 0 || file.size > MAX_COVER_FILE_SIZE) {
      return null;
    }

    const kind = await detectImageKind(file);
    if (!kind) return null;

    try {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > MAX_UPLOAD_PIXELS) return null;

        const scale = Math.min(
          1,
          MAX_UPLOAD_DIMENSION / Math.max(bitmap.width, bitmap.height),
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return null;

        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        const qualityLevels = [0.9, 0.75, 0.6, 0.45, 0.3];
        for (const quality of qualityLevels) {
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/webp', quality),
          );
          if (blob && blob.size <= maxBytes) {
            return blob;
          }
          if (blob && blob.size > maxBytes && quality === qualityLevels[qualityLevels.length - 1]) {
            return blob;
          }
        }

        return null;
      } finally {
        bitmap.close();
      }
    } catch {
      return null;
    }
  }

  private async prepareCoverPhoto(file: File): Promise<Blob | null> {
    if (file.size === 0 || file.size > MAX_COVER_FILE_SIZE) {
      return null;
    }

    const kind = await detectImageKind(file);
    if (!kind) return null;

    try {
      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > MAX_COVER_PIXELS) return null;

        const scale = Math.min(
          1,
          MAX_COVER_DIMENSION / Math.max(bitmap.width, bitmap.height),
        );
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return null;
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        const qualityLevels = [0.9, 0.8, 0.7, 0.55, 0.4];
        for (const quality of qualityLevels) {
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/webp', quality),
          );
          if (blob && blob.size <= MAX_COVER_FILE_SIZE) {
            return blob;
          }
        }

        return null;
      } finally {
        bitmap.close();
      }
    } catch {
      return null;
    }
  }
}
