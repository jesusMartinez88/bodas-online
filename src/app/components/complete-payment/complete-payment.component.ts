import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PaymentService } from '../../services/payment.service';
import { AuthService } from '../../services/auth.service';
import type { AppliedDiscount, PaymentIntentResponse } from '../../../types/api';
import type { StripePaymentElement } from '@stripe/stripe-js';

/**
 * Pantalla de pago destinada a usuarios que ya tienen cuenta pero
 * NO han completado el pago (porque cerraron el navegador durante
 * el registro, falló el 3DS, etc.).
 *
 * El `paymentGuard` del dashboard redirige aquí cuando `paidAt`
 * es `null`. Al terminar el pago, marcamos `paidAt` optimistamente
 * con `AuthService.markAsPaid()` y navegamos al dashboard del slug.
 *
 * La UI es deliberadamente la misma que el paso 3 del register:
 *   - Stripe Payment Element (si el backend tiene claves)
 *   - Botón demo (si no) — útil para entornos sin Stripe configurado
 *
 * Si el usuario ya pagó y llega aquí por error, lo redirigimos
 * automáticamente a su dashboard.
 */
@Component({
  selector: 'app-complete-payment',
  templateUrl: './complete-payment.component.html',
  styleUrl: './complete-payment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class CompletePaymentComponent implements OnInit {
  protected readonly paymentMode = signal<
    'loading' | 'ready' | 'unavailable' | 'error'
  >('loading');
  protected readonly paymentProcessing = signal(false);
  protected readonly paymentError = signal<string | null>(null);
  protected readonly paymentAmountMajor = signal<string>('59,00');
  protected readonly paymentCurrency = signal<string>('eur');

  // ── Estado del código de descuento ────────────────────────────
  protected readonly discountCodeInput = signal<string>('');
  protected readonly appliedDiscount = signal<AppliedDiscount | null>(null);
  protected readonly baseAmountCents = signal<number>(0);
  protected readonly discountError = signal<string | null>(null);
  protected readonly discountProcessing = signal<boolean>(false);

  /** Handler `(input)` del campo de código. */
  protected onDiscountCodeInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.discountCodeInput.set(target?.value ?? '');
    if (this.discountError()) this.discountError.set(null);
  }

  private readonly paymentElementContainer =
    viewChild<ElementRef<HTMLDivElement>>('paymentElement');
  private mountedPaymentElement: StripePaymentElement | null = null;

  private readonly paymentService = inject(PaymentService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  /**
   * `effect` único que monta/desmonta el Payment Element de Stripe
   * según `paymentMode` y la disponibilidad del contenedor DOM.
   *
   * - `mode === 'ready'` y contenedor disponible → monta (una vez).
   * - Cualquier otro caso → desmonta si había algo.
   */
  private readonly mountEffect = effect(() => {
    const mode = this.paymentMode();
    const container =
      this.paymentElementContainer()?.nativeElement ?? null;

    if (mode !== 'ready' || !container) {
      if (this.mountedPaymentElement) {
        this.paymentService.destroyElements();
        this.mountedPaymentElement = null;
      }
      return;
    }

    if (this.mountedPaymentElement) return;
    this.mountedPaymentElement =
      this.paymentService.mountPaymentElement(container);
  });

  async ngOnInit(): Promise<void> {
    // Si el usuario ya tiene `paidAt` cuando llega aquí (admin lo
    // marcó manualmente, sesión con token viejo + login posterior),
    // salimos al dashboard sin pintar el formulario.
    const user = this.authService.currentUser();
    if (user?.paidAt) {
      this.router.navigate([`/${user.slug}/dashboard`]);
      return;
    }
    await this.initializePayment();
  }

  /**
   * Equivalente a `register.initializePayment`, sin el questionnaire.
   */
  private async initializePayment(): Promise<void> {
    this.paymentMode.set('loading');
    this.paymentError.set(null);
    this.appliedDiscount.set(null);
    this.discountError.set(null);
    try {
      const cfg = await this.paymentService.loadConfig();
      const baseCents = cfg.amount ?? 0;
      this.baseAmountCents.set(baseCents);
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
          'No pudimos cargar el formulario de pago seguro. Continúa en modo demo.',
        );
        return;
      }
      const elements = await this.paymentService.createElements(
        intent.clientSecret,
      );
      if (!elements) {
        this.paymentMode.set('unavailable');
        this.paymentError.set(
          'No pudimos cargar el formulario de pago seguro. Continúa en modo demo.',
        );
        return;
      }
      this.paymentMode.set('ready');
    } catch (err) {
      console.error('[complete-payment] initializePayment error:', err);
      this.paymentMode.set('unavailable');
      this.paymentError.set(
        'No pudimos conectar con el servicio de pagos. Continúa en modo demo.',
      );
    }
  }

  /**
   * Crea (o reemplaza) el PaymentIntent pasándole el código de
   * descuento que esté aplicado. Ver también `register.component.ts`
   * (misma lógica; podría refactorizarse a un composable si esto
   * se replica en más sitios).
   */
  private async createOrReplaceIntent(): Promise<PaymentIntentResponse | null> {
    const applied = this.appliedDiscount();
    const code = applied?.code ?? null;

    const intent = await this.paymentService.createIntent(code);

    if (intent && intent.valid === false) {
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

  /** Aplica el código introducido y re-crea el PaymentIntent. */
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
      const validation = await this.paymentService.validateDiscountCode(code);
      if (!validation || validation.valid !== true) {
        this.discountError.set(
          validation?.message ??
            'El código no es válido, está inactivo o ha expirado.',
        );
        return;
      }

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

      this.paymentService.destroyElements();
      this.mountedPaymentElement = null;
      this.paymentMode.set('loading');

      const intent = await this.paymentService.createIntent(
        this.appliedDiscount()?.code ?? null,
      );

      if (intent?.valid === false) {
        this.appliedDiscount.set(null);
        this.discountError.set(intent.message ?? 'El código no es válido.');
        this.discountCodeInput.set('');
        const retry = await this.paymentService.createIntent(null);
        if (retry && retry.clientSecret) {
          const elements = await this.paymentService.createElements(
            retry.clientSecret,
          );
          if (elements) this.paymentMode.set('ready');
        }
        return;
      }

      if (intent?.discount) this.appliedDiscount.set(intent.discount);

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
      console.error('[complete-payment] applyDiscountCode error:', err);
      this.discountError.set(
        'No pudimos comprobar el código. Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      this.discountProcessing.set(false);
    }
  }

  /** Quita el cupón aplicado y recrea el PaymentIntent sin descuento. */
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
      console.error('[complete-payment] clearDiscountCode error:', err);
      this.paymentMode.set('unavailable');
    }
  }

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

  async completePayment(): Promise<void> {
    if (this.paymentProcessing()) return;
    this.paymentError.set(null);
    this.paymentProcessing.set(true);

    if (this.paymentMode() === 'ready') {
      try {
        const returnUrl = `${window.location.origin}/complete-payment?return=1`;
        const result = await this.paymentService.confirmPayment(returnUrl);

        if (result.status === 'succeeded') {
          this.authService.markAsPaid();
          this.paymentProcessing.set(false);
          this.paymentService.destroyElements();
          this.navigateToDashboard();
          return;
        }
        if (result.status === 'processing') {
          this.paymentProcessing.set(false);
          this.paymentError.set(
            'Tu banco está procesando el pago. Te avisaremos en cuanto se confirme.',
          );
          return;
        }
        this.paymentProcessing.set(false);
        this.paymentError.set(
          result.error ||
            'El pago no se completó. Revisa los datos e inténtalo de nuevo.',
        );
        return;
      } catch (err) {
        console.error('[complete-payment] confirmPayment error:', err);
        this.paymentProcessing.set(false);
        this.paymentError.set(
          'No pudimos procesar el pago. Inténtalo de nuevo en unos segundos.',
        );
        return;
      }
    }

    // Modo demo (Stripe no configurado)
    window.setTimeout(() => {
      this.authService.markAsPaid();
      this.paymentProcessing.set(false);
      this.navigateToDashboard();
    }, 700);
  }

  private navigateToDashboard(): void {
    const slug = this.authService.currentUser()?.slug;
    if (slug) {
      this.router.navigate([`/${slug}/dashboard`]);
    } else {
      this.router.navigate(['/login']);
    }
  }
}