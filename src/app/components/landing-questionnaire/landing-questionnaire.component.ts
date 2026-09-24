import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Cuestionario inicial de la landing que el cliente rellena justo después
 * de registrarse.
 *
 * Es un componente presentacional controlado por el padre
 * (`RegisterComponent`): el padre le pasa los valores iniciales y un
 * `output` con el payload ya saneado cuando el usuario pulsa "Continuar".
 *
 * Decisiones de diseño:
 *   - Standalone + OnPush + signals (cumple guidelines Angular 21).
 *   - Cero dependencias con `HttpClient`: el servicio de cuestionario
 *     lo inyecta el padre, que sabe cuándo llamar a `save()`.
 *   - El color predominante se ofrece con swatches rápidos (rosa, azul,
 *     verde, beige, lavanda, libre) para reducir fricción en móvil.
 *   - El campo `notes` y los servicios extra (autobús, hotel) son
 *     opcionales: el cliente puede no tener autobus/hotel y no pasa nada.
 */
/**
 * Payload emitido por el cuestionario al hacer submit. Incluye el value
 * final del formulario más las URLs de "Nuestra historia" que el usuario
 * marcó para eliminar (modo dashboard). En el registro la lista de URLs
 * a borrar va vacía.
 */
export interface LandingQuestionnaireSubmission {
  value: LandingQuestionnaireValue;
  ourStoryPhotosToDelete: string[];
  galleryPhotosToDelete: string[];
}

/**
 * Foto individual de "Nuestra historia".
 *
 * - En el registro: el usuario selecciona un archivo nuevo (`file`),
 *   `existingUrl` es `null`.
 * - En el editor del dashboard: la fila representa una foto ya subida
 *   al media server (`existingUrl` con la URL absoluta) y opcionalmente
 *   el usuario puede reemplazarla (`file` con un nuevo archivo).
 *
 * `caption` se mantiene editable en ambos flujos.
 */
export interface OurStoryPhoto {
  existingUrl: string | null;
  file: File | null;
  caption: string;
}

export interface CoverPhoto {
  existingUrl: string | null;
  file: File | null;
}

export interface LandingQuestionnaireValue {
  weddingDate: string;
  estimatedGuests: number | null;
  predominantColor: string;
  hasCountdown: boolean;
  hasBusService: boolean;
  hasHotelService: boolean;
  hasCoverPhoto: boolean;
  coverPhoto: CoverPhoto;
  // Extra landing sections
  hasOurStory: boolean;
  // Fotos de "Nuestra historia": pares archivo + caption. Solo frontend;
  // los archivos se suben aparte y los captions se persisten con el
  // cuestionario en una columna JSON (ourStoryCaptions).
  ourStoryPhotos: OurStoryPhoto[];
  hasGallery: boolean;
  // Archivos pendientes de subir para la galería (solo frontend; no se
  // envían al backend como parte del cuestionario: se suben aparte vía
  // /api/invitation-media/gallery después de crear la cuenta).
  galleryFiles: File[];
  // URLs actuales de la galería ya persistidas en el backend. Sirven para
  // rehidratar el contador y una vista previa en el editor de invitación.
  galleryExistingUrls: string[];
  hasAddToCalendar: boolean;
  hasVenueMap: boolean;
  hasGiftRegistry: boolean;
  giftBankAccount: string;
  hasBackgroundMusic: boolean;
  backgroundMusicSong: string;
  // Contact the couple
  contactCouple: boolean;
  contactGroomPhone: string;
  contactBridePhone: string;
  additionalServices: string;
  notes: string;
}

/** Máximo de fotos permitidas en la galería (alineado con el backend). */
export const GALLERY_MAX_FILES = 12;

/** Tipos MIME aceptados para la galería (alineado con el backend). */
export const GALLERY_ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Máximo de fotos permitidas en "Nuestra historia" (alineado con el backend). */
export const OUR_STORY_MAX_PHOTOS = 12;

@Component({
  selector: 'app-landing-questionnaire',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './landing-questionnaire.component.html',
  styleUrl: './landing-questionnaire.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingQuestionnaireComponent {
  /** Estado inicial (por defecto, todo en blanco). */
  initialValue = input<LandingQuestionnaireValue>({
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

  /** Estado de envío controlado por el padre (para deshabilitar el botón). */
  submitting = input<boolean>(false);

  /** Mensaje de error controlado por el padre (red, validación backend...). */
  errorMessage = input<string | null>(null);

  /** Cambia el texto de acción cuando el formulario edita una cuenta existente. */
  editing = input(false);

  /**
   * Se dispara cuando el usuario quiere avanzar. El padre es responsable
   * de llamar al backend y decidir qué pantalla mostrar a continuación.
   *
   * Se emite un `LandingQuestionnaireSubmission` que incluye el value
   * final y las URLs existentes que el usuario marcó para eliminar (solo
   * se rellena en el editor del dashboard; en el registro va vacío).
   */
  readonly submitted = output<LandingQuestionnaireSubmission>();

  /**
   * Estado interno del formulario. Se inicializa desde `initialValue()`
   * cada vez que cambia la entrada (patrón signal-driven).
   */
  protected form = signal<LandingQuestionnaireValue>(this.initialValue());

  constructor() {
    effect(() => {
      const initialValue = this.initialValue();

      this.form.set({
        ...initialValue,
        coverPhoto: { ...initialValue.coverPhoto },
        ourStoryPhotos: initialValue.ourStoryPhotos.map((photo) => ({ ...photo })),
        galleryFiles: [...initialValue.galleryFiles],
        galleryExistingUrls: [...(initialValue.galleryExistingUrls ?? [])],
      });
      this.removedOurStoryUrls.set([]);
      this.removedGalleryUrls.set([]);
    });
  }

  /** Swatches rápidos para el color predominante. */
  protected readonly colorPresets = [
    { value: 'rosa', label: 'Rosa', hex: '#ec4899' },
    { value: 'azul', label: 'Azul', hex: '#2563eb' },
    { value: 'verde', label: 'Verde', hex: '#10b981' },
    { value: 'beige', label: 'Beige', hex: '#d4b896' },
    { value: 'lavanda', label: 'Lavanda', hex: '#a78bfa' },
    { value: 'dorado', label: 'Dorado', hex: '#d4af37' },
  ];

  /** ¿Está todo lo obligatorio rellenado? (cuestionario válido). */
  protected readonly isValid = computed(() => {
    const v = this.form();
    if (!v.weddingDate) return false;
    if (v.estimatedGuests === null || v.estimatedGuests === undefined) return false;
    if (Number.isNaN(Number(v.estimatedGuests))) return false;
    if (!v.predominantColor) return false;
    return true;
  });

  /** Helpers para [(ngModel)] con signals. */
  protected patchField<K extends keyof LandingQuestionnaireValue>(
    key: K,
    value: LandingQuestionnaireValue[K],
  ) {
    this.form.update((current) => ({ ...current, [key]: value }));
  }

  /**
   * URLs de fotos de "Nuestra historia" que el usuario eliminó durante
   * la edición. Se vacía al inicializar (cambio de `initialValue`) y se
   * emite en `onSubmit` para que el padre las borre del media server
   * antes de subir el cuestionario actualizado.
   */
  protected readonly removedOurStoryUrls = signal<string[]>([]);
  protected readonly removedGalleryUrls = signal<string[]>([]);

  /** El usuario quiere enviar el cuestionario. */
  protected onSubmit() {
    if (this.submitting()) return;
    if (!this.isValid()) return;
    this.submitted.emit({
      value: this.form(),
      ourStoryPhotosToDelete: this.removedOurStoryUrls(),
      galleryPhotosToDelete: this.removedGalleryUrls(),
    });
  }

  /** Mensaje de error específico de la galería (formato, máximo, etc.). */
  protected readonly galleryError = signal<string | null>(null);

  protected readonly coverError = signal<string | null>(null);

  protected onCoverToggle(checked: boolean) {
    this.patchField('hasCoverPhoto', checked);
    if (!checked) {
      this.patchField('coverPhoto', { existingUrl: null, file: null });
      this.coverError.set(null);
    }
  }

  protected onCoverFileSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.item(0) ?? null;
    if (input) input.value = '';

    if (!file) return;
    if (!(GALLERY_ACCEPTED_MIME as readonly string[]).includes(file.type)) {
      this.coverError.set('Solo se admiten fotos en formato JPEG, PNG o WebP.');
      return;
    }

    this.patchField('hasCoverPhoto', true);
    this.patchField('coverPhoto', { existingUrl: null, file });
    this.coverError.set(null);
  }

  protected removeCoverFile() {
    this.patchField('hasCoverPhoto', false);
    this.patchField('coverPhoto', { existingUrl: null, file: null });
    this.coverError.set(null);
  }

  /** Si el checkbox de galería está desmarcado, descartamos los archivos seleccionados. */
  protected onGalleryToggle(checked: boolean) {
    this.patchField('hasGallery', checked);
    if (!checked) {
      this.removedGalleryUrls.update((urls) => [
        ...new Set([...urls, ...this.form().galleryExistingUrls]),
      ]);
      this.patchField('galleryFiles', []);
      this.patchField('galleryExistingUrls', []);
      this.galleryError.set(null);
    }
  }

  /**
   * Maneja la selección de archivos desde el input. Filtra por MIME
   * (JPEG/PNG/WebP) y respeta el máximo de 12. Resetea el valor del
   * input para permitir re-seleccionar el mismo archivo si se borró.
   */
  protected onGalleryFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement | null;
    const files = input?.files ? Array.from(input.files) : [];
    if (input) input.value = '';

    const current = this.form().galleryFiles;
    const existingCount = this.form().galleryExistingUrls.length;
    const accepted = files.filter((file) =>
      (GALLERY_ACCEPTED_MIME as readonly string[]).includes(file.type),
    );
    const rejectedCount = files.length - accepted.length;

    const remaining = GALLERY_MAX_FILES - (current.length + existingCount);
    if (remaining <= 0) {
      this.galleryError.set(
        `Has llegado al máximo de ${GALLERY_MAX_FILES} fotos. Quita alguna para añadir más.`,
      );
      return;
    }

    const toAdd = accepted.slice(0, remaining);
    const overflow = accepted.length - toAdd.length;

    const parts: string[] = [];
    if (rejectedCount > 0) {
      parts.push('Solo se admiten fotos en formato JPEG, PNG o WebP.');
    }
    if (overflow > 0) {
      parts.push(
        `Solo cabían ${remaining} foto(s) más; se ignoraron ${overflow}.`,
      );
    }
    this.galleryError.set(parts.length ? parts.join(' ') : null);

    if (toAdd.length > 0) {
      this.patchField('galleryFiles', [...current, ...toAdd]);
    }
  }

  /** Quita una foto de la lista de pendientes. */
  protected removeGalleryFile(index: number) {
    this.form.update((f) => ({
      ...f,
      galleryFiles: f.galleryFiles.filter((_, i) => i !== index),
    }));
    this.galleryError.set(null);
  }

  /** Quita una foto ya persistida de la galería en modo edición. */
  protected removeGalleryExistingPhoto(index: number) {
    const removed = this.form().galleryExistingUrls[index];
    if (!removed) return;

    this.removedGalleryUrls.update((urls) =>
      urls.includes(removed) ? urls : [...urls, removed],
    );

    this.form.update((f) => ({
      ...f,
      galleryExistingUrls: f.galleryExistingUrls.filter((_, i) => i !== index),
    }));
    this.galleryError.set(null);
  }

  /** Mensaje de error específico del uploader de "Nuestra historia". */
  protected readonly ourStoryError = signal<string | null>(null);

  /** Si se desmarca "Nuestra historia", descartamos las filas añadidas. */
  protected onOurStoryToggle(checked: boolean) {
    this.patchField('hasOurStory', checked);
    if (!checked) {
      this.patchField('ourStoryPhotos', []);
      this.ourStoryError.set(null);
    }
  }

  /** Añade una fila vacía (sin archivo) al final. Bloqueado al llegar al máximo. */
  protected addOurStoryPhoto() {
    const current = this.form().ourStoryPhotos;
    if (current.length >= OUR_STORY_MAX_PHOTOS) {
      this.ourStoryError.set(`Has llegado al máximo de ${OUR_STORY_MAX_PHOTOS} fotos.`);
      return;
    }
    this.patchField('ourStoryPhotos', [
      ...current,
      { existingUrl: null, file: null, caption: '' },
    ]);
    this.ourStoryError.set(null);
  }

  /**
   * Quita una fila entera. Si la fila representa una foto ya subida al
   * media server (`existingUrl`), guardamos esa URL en `removedOurStoryUrls`
   * para que el padre la borre del backend antes de guardar el cuestionario.
   */
  protected removeOurStoryPhoto(index: number) {
    const removed = this.form().ourStoryPhotos[index];
    if (removed?.existingUrl) {
      this.removedOurStoryUrls.update((urls) =>
        urls.includes(removed.existingUrl as string)
          ? urls
          : [...urls, removed.existingUrl as string],
      );
    }
    this.form.update((f) => ({
      ...f,
      ourStoryPhotos: f.ourStoryPhotos.filter((_, i) => i !== index),
    }));
    this.ourStoryError.set(null);
  }

  /**
   * Asigna el archivo elegido a la fila `index`. Si el usuario selecciona
   * varios a la vez, se reparten por las filas vacías que haya (o se
   * rechazan si no caben). Filtra por MIME y respeta el máximo global.
   */
  protected onOurStoryFileSelected(event: Event, index: number) {
    const input = event.target as HTMLInputElement | null;
    const files = input?.files ? Array.from(input.files) : [];
    if (input) input.value = '';

    const current = this.form().ourStoryPhotos;

    const accepted = files.filter((file) =>
      (GALLERY_ACCEPTED_MIME as readonly string[]).includes(file.type),
    );
    const rejectedCount = files.length - accepted.length;

    const totalFilesSelected = current.filter((p) => p.file).length;
    const remaining = OUR_STORY_MAX_PHOTOS - totalFilesSelected;
    if (remaining <= 0) {
      this.ourStoryError.set(
        `Has llegado al máximo de ${OUR_STORY_MAX_PHOTOS} fotos. Quita alguna para añadir más.`,
      );
      return;
    }

    const toAdd = accepted.slice(0, remaining);
    const overflow = accepted.length - toAdd.length;

    const parts: string[] = [];
    if (rejectedCount > 0) {
      parts.push('Solo se admiten fotos en formato JPEG, PNG o WebP.');
    }
    if (overflow > 0) {
      parts.push(
        `Solo cabían ${remaining} foto(s) más; se ignoraron ${overflow}.`,
      );
    }
    this.ourStoryError.set(parts.length ? parts.join(' ') : null);

    if (toAdd.length === 0) return;

    // Si el usuario seleccionó varios archivos en una sola pasada, los
    // colocamos en orden: primero en la fila que disparó el evento, y
    // los siguientes en las filas vacías siguientes (si existen). Si no
    // quedan filas vacías y aún cabe alguno, los añadimos como filas
    // nuevas al final.
    //
    // Si la fila destino ya tenía una foto subida al media server, la
    // marcamos para eliminar (porque va a ser reemplazada por la nueva)
    // y conservamos el caption escrito por el usuario.
    const next = current.map((p) => ({ ...p }));
    let cursor = index;
    for (const file of toAdd) {
      while (cursor < next.length && next[cursor].file !== null) cursor += 1;
      if (cursor >= next.length) {
        if (next.length >= OUR_STORY_MAX_PHOTOS) break;
        next.push({ existingUrl: null, file, caption: '' });
      } else {
        if (next[cursor].existingUrl) {
          this.removedOurStoryUrls.update((urls) =>
            urls.includes(next[cursor].existingUrl as string)
              ? urls
              : [...urls, next[cursor].existingUrl as string],
          );
        }
        next[cursor] = {
          existingUrl: null,
          file,
          caption: next[cursor].caption,
        };
      }
      cursor += 1;
    }
    this.patchField('ourStoryPhotos', next);
  }

  /** Actualiza el caption de la fila `index`. */
  protected onOurStoryCaptionChange(index: number, value: string) {
    this.form.update((f) => {
      const next = f.ourStoryPhotos.map((p, i) =>
        i === index ? { ...p, caption: value } : p,
      );
      return { ...f, ourStoryPhotos: next };
    });
  }

  /** Indica si la opción personalizada 'Otro' está activa. */
  protected readonly isCustomColorSelected = computed(() => {
    const current = this.form().predominantColor;
    if (!current) return false;
    return !this.colorPresets.some((p) => p.value === current);
  });

  /** Valor hexadecimal para el input type="color". */
  protected readonly customColorHex = computed(() => {
    const current = this.form().predominantColor;
    if (current && /^#[0-9a-fA-F]{6}$/i.test(current)) {
      return current;
    }
    return '#ec4899';
  });

  protected isPresetSelected(value: string): boolean {
    return this.form().predominantColor === value;
  }

  protected onColorPresetClick(value: string) {
    this.patchField('predominantColor', value);
  }

  protected onCustomColorChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (input?.value) {
      this.patchField('predominantColor', input.value);
    }
  }

  protected onCustomColorClick(): void {
    if (!this.isCustomColorSelected()) {
      this.patchField('predominantColor', this.customColorHex());
    }
  }

  /**
   * ngModelChange del input numérico: convierte string → number para
   * mantener el tipo del signal. Null/"" → null para "sin respuesta".
   * Vive aquí (no inline en el template) porque `Number(...)` no
   * está disponible en el contexto del template compilado.
   */
  protected onEstimatedGuestsChange(value: unknown): void {
    if (value === null || value === '' || value === undefined) {
      this.patchField('estimatedGuests', null);
      return;
    }
    const n = Number(value);
    this.patchField('estimatedGuests', Number.isNaN(n) ? null : n);
  }
}
