import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { LandingQuestionnaireService } from '../../services/landing-questionnaire.service';
import { InvitationMediaService } from '../../services/invitation-media.service';
import {
  LandingQuestionnaireComponent,
  LandingQuestionnaireValue,
} from '../landing-questionnaire/landing-questionnaire.component';

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
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

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
 * Flujo de registro (3 pasos):
 *
 *   1. Datos básicos (nombres, username, email, password).
 *      Botón → "Continuar" (antes "Continuar al pago").
 *   2. Cuestionario inicial de la landing (fecha, invitados, color,
 *      servicios extra, etc.). Se guarda asociado al usuario recién
 *      creado en el mismo submit.
 *   3. Éxito → "Ir a mi Panel de Control".
 *
 * El paso de pago que había antes se ha eliminado: era simulado y
 * ya no tiene sentido ahora que el cuestionario es el siguiente
 * paso lógico. La venta/cobro se gestiona aparte con el admin.
 */
@Component({
  selector: 'app-register',
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LandingQuestionnaireComponent],
})
export class RegisterComponent {
  protected readonly step = signal<1 | 2 | 3>(1);
  protected readonly processing = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly createdSlug = signal<string | null>(null);

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
    names: '',
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
  private router = inject(Router);

  /**
   * Paso 1 → 2. Valida los datos básicos y consulta si el username
   * está libre antes de dejar avanzar al cuestionario.
   */
  goToQuestionnaire() {
    this.errorMessage.set(null);
    this.usernameMessage.set(null);

    if (
      !this.formData.names ||
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
