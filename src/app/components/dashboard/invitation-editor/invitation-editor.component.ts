import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { InvitationMediaService } from '../../../services/invitation-media.service';
import { LandingQuestionnaireService } from '../../../services/landing-questionnaire.service';
import {
  LandingQuestionnaireComponent,
  LandingQuestionnaireSubmission,
  LandingQuestionnaireValue,
} from '../../landing-questionnaire/landing-questionnaire.component';
import { LandingQuestionnaire } from '../../../../types/api';

type ImageKind = 'jpeg' | 'png' | 'webp';

interface PreparedPhoto {
  id: string;
  url: string;
  name: string;
}

interface PreparedUpload {
  blob: Blob;
  name: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 20_000_000;
const MAX_RENDER_DIMENSION = 2560;
const MAX_GALLERY_PHOTOS = 12;

interface OurStoryEntry {
  url: string;
  caption: string;
}

@Component({
  selector: 'app-invitation-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, LandingQuestionnaireComponent],
  templateUrl: './invitation-editor.component.html',
  styleUrl: './invitation-editor.component.css',
})
export class InvitationEditorComponent implements OnInit {
  private readonly mediaService = inject(InvitationMediaService);
  private readonly questionnaireService = inject(LandingQuestionnaireService);
  readonly invitationUrl = input.required<string>();

  readonly coverPhoto = signal<PreparedPhoto | null>(null);
  readonly galleryPhotos = signal<PreparedPhoto[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly isPreparing = signal(false);

  // Cuestionario actual del usuario. Si es null todavía no lo rellenó.
  readonly currentQuestionnaire = signal<LandingQuestionnaire | null>(null);
  readonly isLoadingQuestionnaire = signal<boolean>(true);

  // Estado de guardado del cuestionario.
  readonly isSavingQuestionnaire = signal<boolean>(false);
  readonly questionnaireSavedAt = signal<Date | null>(null);

  // Valores iniciales que pasamos al cuestionario (rehidratan el form).
  readonly initialQuestionnaireValue =
    signal<LandingQuestionnaireValue | null>(null);

  async ngOnInit() {
    const [media, questionnaire] = await Promise.all([
      this.loadMedia(),
      this.loadQuestionnaire(),
    ]);
    this.initialQuestionnaireValue.set(
      this.toQuestionnaireValue(
        questionnaire,
        media?.coverUrl ?? null,
        media?.galleryUrls ?? [],
      ),
    );
  }

  private async loadMedia() {
    try {
      const media = await firstValueFrom(this.mediaService.listMine());
      this.coverPhoto.set(
        media.coverUrl ? this.toPreparedPhoto(media.coverUrl) : null,
      );
      this.galleryPhotos.set(
        media.galleryUrls.map((url) => this.toPreparedPhoto(url)),
      );
      return media;
    } catch {
      this.errorMessage.set('No se pudieron cargar las fotos guardadas.');
      return null;
    }
  }

  private async loadQuestionnaire() {
    try {
      const q = await this.questionnaireService.getMine();
      this.currentQuestionnaire.set(q);
      return q;
    } catch {
      this.errorMessage.set('No se pudo cargar el cuestionario actual.');
      return null;
    } finally {
      this.isLoadingQuestionnaire.set(false);
    }
  }

  /**
   * Convierte la fila del backend en el shape que entiende el componente
   * cuestionario. Si `q` es null (el usuario nunca rellenó el cuestionario),
   * devuelve los defaults en blanco para que el form se muestre vacío.
   */
  private toQuestionnaireValue(
    q: LandingQuestionnaire | null,
    coverUrl: string | null = null,
    galleryUrls: string[] = [],
  ): LandingQuestionnaireValue {
    const parseEntries = (raw: string | null | undefined): OurStoryEntry[] => {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
          .filter((e) => e && typeof e === 'object' && typeof e.url === 'string')
          .map((e) => ({
            url: e.url,
            caption: typeof e.caption === 'string' ? e.caption : '',
          }));
      } catch {
        return [];
      }
    };

    const entries = q ? parseEntries(q.ourStoryEntries) : [];
    const ourStoryPhotos = entries.map((entry) => ({
      existingUrl: entry.url,
      file: null,
      caption: entry.caption,
    }));

    if (!q) {
      return {
        weddingDate: '',
        estimatedGuests: null,
        predominantColor: '',
        hasCountdown: true,
        hasBusService: false,
        hasHotelService: false,
        hasCoverPhoto: coverUrl !== null,
        coverPhoto: { existingUrl: coverUrl, file: null },
        hasOurStory: false,
        ourStoryPhotos,
        hasGallery: galleryUrls.length > 0,
        galleryFiles: [],
        galleryExistingUrls: galleryUrls,
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
      };
    }

    return {
      weddingDate: q.weddingDate ?? '',
      estimatedGuests: q.estimatedGuests ?? null,
      predominantColor: q.predominantColor ?? '',
      hasCountdown: q.hasCountdown === 1,
      hasBusService: q.hasBusService === 1,
      hasHotelService: q.hasHotelService === 1,
      hasCoverPhoto: q.hasCoverPhoto === 1 || coverUrl !== null,
      coverPhoto: { existingUrl: coverUrl, file: null },
      hasOurStory: q.hasOurStory === 1,
      ourStoryPhotos,
      hasGallery: q.hasGallery === 1 || galleryUrls.length > 0,
      galleryFiles: [],
      galleryExistingUrls: galleryUrls,
      hasAddToCalendar: q.hasAddToCalendar === 1,
      hasVenueMap: q.hasVenueMap === 1,
      hasGiftRegistry: q.hasGiftRegistry === 1,
      giftBankAccount: q.giftBankAccount ?? '',
      hasBackgroundMusic: q.hasBackgroundMusic === 1,
      backgroundMusicSong: q.backgroundMusicSong ?? '',
      contactCouple: q.contactCouple === 1,
      contactGroomPhone: q.contactGroomPhone ?? '',
      contactBridePhone: q.contactBridePhone ?? '',
      additionalServices: q.additionalServices ?? '',
      notes: q.notes ?? '',
    };
  }

  /**
   * Handler del `submitted` del cuestionario. Aquí se hace la coreografía
   * completa: borrar del media server las fotos que el usuario quitó,
   * subir las nuevas, y persistir el cuestionario.
   */
  async onQuestionnaireSubmitted(submission: LandingQuestionnaireSubmission) {
    if (this.isSavingQuestionnaire()) return;
    this.isSavingQuestionnaire.set(true);
    this.errorMessage.set(null);

    const { value, ourStoryPhotosToDelete, galleryPhotosToDelete } = submission;

    try {
      // 1) Borrar del media server las fotos que el usuario eliminó.
      for (const url of ourStoryPhotosToDelete) {
        try {
          await firstValueFrom(this.mediaService.remove(url));
        } catch (err) {
          console.warn('[invitation-editor] no se pudo borrar foto:', url, err);
        }
      }

      for (const url of galleryPhotosToDelete) {
        try {
          await firstValueFrom(this.mediaService.remove(url));
        } catch (err) {
          console.warn('[invitation-editor] no se pudo borrar foto de galería:', url, err);
        }
      }

      // Subir las fotos nuevas que el usuario adjuntó desde el cuestionario.
      if (value.hasGallery && value.galleryFiles.length > 0) {
        const preparedGallery = await Promise.all(
          value.galleryFiles.map((file) => this.preparePhoto(file)),
        );
        const validGallery = preparedGallery.filter(
          (photo): photo is PreparedUpload => photo !== null,
        );
        if (validGallery.length > 0) {
          await firstValueFrom(
            this.mediaService.uploadGallery(validGallery.map((photo) => photo.blob)),
          );
        }
      }

      // 2) Subir las fotos nuevas (si el cliente marcó "Nuestra historia"
      //    y añadió archivos pendientes). El backend devuelve las URLs en
      //    el mismo orden en que se enviaron los archivos.
      const newFiles = value.ourStoryPhotos
        .map((p) => p.file)
        .filter((f): f is File => f !== null);
      let uploadedUrls: string[] = [];
      if (value.hasOurStory && newFiles.length > 0) {
        const prepared = await Promise.all(
          newFiles.map((file) => this.preparePhoto(file)),
        );
        const valid = prepared.filter(
          (p): p is PreparedUpload => p !== null,
        );
        if (valid.length > 0) {
          uploadedUrls = await firstValueFrom(
            this.mediaService.uploadHistory(valid.map((v) => v.blob)),
          );
        }
      }

      // 3) Guardar la única foto de portada. El endpoint reemplaza cover.webp,
      // por lo que no se crean versiones adicionales al sustituirla.
      if (value.hasCoverPhoto && value.coverPhoto.file) {
        const preparedCover = await this.preparePhoto(value.coverPhoto.file);
        if (!preparedCover) throw new Error('Invalid cover photo');
        const coverUrl = await firstValueFrom(
          this.mediaService.uploadCover(preparedCover.blob),
        );
        this.coverPhoto.set(this.toPreparedPhoto(coverUrl, preparedCover.name));
      } else if (!value.hasCoverPhoto && this.coverPhoto()) {
        await firstValueFrom(this.mediaService.remove(this.coverPhoto()!.url));
        this.coverPhoto.set(null);
      }

      // 4) Construir el array final de entries {url, caption} en el mismo
      //    orden de las filas. Las filas con existingUrl se mantienen, las
      //    con file se reemplazan por la nueva URL subida (mismo orden
      //    en uploadedUrls), y las filas sin ninguno de los dos se
      //    descartan (caso "añadí una fila vacía y no la rellené").
      let uploadCursor = 0;
      const finalEntries: OurStoryEntry[] = [];
      for (const photo of value.ourStoryPhotos) {
        if (photo.existingUrl) {
          finalEntries.push({
            url: photo.existingUrl,
            caption: photo.caption.trim(),
          });
        } else if (photo.file) {
          const url = uploadedUrls[uploadCursor++];
          if (url) {
            finalEntries.push({ url, caption: photo.caption.trim() });
          }
        }
      }

      // 5) Guardar el cuestionario.
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
        ourStoryEntries:
          finalEntries.length > 0 ? JSON.stringify(finalEntries) : null,
        contactCouple: value.contactCouple,
        contactGroomPhone: value.contactGroomPhone.trim() || null,
        contactBridePhone: value.contactBridePhone.trim() || null,
        additionalServices: value.additionalServices.trim() || null,
        notes: value.notes.trim() || null,
      });

      // 6) Refrescar estado local para que el form siga mostrando lo que
      //    se acaba de guardar (importante si hubo reemplazos o subidas).
      const [refreshed, refreshedMedia] = await Promise.all([
        this.questionnaireService.getMine(),
        firstValueFrom(this.mediaService.listMine()),
      ]);
      this.currentQuestionnaire.set(refreshed);
      this.coverPhoto.set(
        refreshedMedia.coverUrl
          ? this.toPreparedPhoto(refreshedMedia.coverUrl)
          : null,
      );
      this.initialQuestionnaireValue.set(
        this.toQuestionnaireValue(
          refreshed,
          refreshedMedia.coverUrl,
          refreshedMedia.galleryUrls,
        ),
      );
      this.questionnaireSavedAt.set(new Date());
    } catch (err) {
      console.error('[invitation-editor] save questionnaire failed:', err);
      this.errorMessage.set(
        'No se pudieron guardar los cambios del cuestionario. Inténtalo de nuevo.',
      );
    } finally {
      this.isSavingQuestionnaire.set(false);
    }
  }

  async addGalleryPhotos(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';

    if (!files.length) return;
    const remaining = MAX_GALLERY_PHOTOS - this.galleryPhotos().length;
    if (remaining <= 0) {
      this.errorMessage.set(
        `Puedes añadir un máximo de ${MAX_GALLERY_PHOTOS} fotos a la galería.`,
      );
      return;
    }

    if (files.length > remaining) {
      this.errorMessage.set(
        `Solo se añadirán ${remaining} fotos para completar el límite de ${MAX_GALLERY_PHOTOS}.`,
      );
    }

    this.isPreparing.set(true);
    try {
      const photos = await Promise.all(
        files.slice(0, remaining).map((file) => this.preparePhoto(file)),
      );
      const validPhotos = photos.filter(
        (photo): photo is PreparedUpload => photo !== null,
      );
      if (!validPhotos.length) return;
      const urls = await firstValueFrom(
        this.mediaService.uploadGallery(validPhotos.map((photo) => photo.blob)),
      );
      this.galleryPhotos.update((current) => [
        ...current,
        ...urls.map((url, index) =>
          this.toPreparedPhoto(url, validPhotos[index].name),
        ),
      ]);
    } catch {
      this.errorMessage.set(
        'No se pudieron guardar las fotos de la galería. Inténtalo de nuevo.',
      );
    } finally {
      this.isPreparing.set(false);
    }
  }

  async removeGalleryPhoto(id: string) {
    const photo = this.galleryPhotos().find((item) => item.id === id) ?? null;
    if (!photo) return;
    try {
      await firstValueFrom(this.mediaService.remove(photo.url));
      this.galleryPhotos.update((photos) =>
        photos.filter((item) => item.id !== id),
      );
    } catch {
      this.errorMessage.set('No se pudo eliminar la foto de la galería.');
    }
  }

  private async preparePhoto(file: File): Promise<PreparedUpload | null> {
    this.errorMessage.set(null);

    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      this.errorMessage.set('Cada imagen debe pesar como máximo 10 MB.');
      return null;
    }

    try {
      const kind = await this.detectImageKind(file);
      if (!kind) {
        this.errorMessage.set(
          'Selecciona una imagen JPEG, PNG o WebP válida. No se admiten SVG ni otros formatos.',
        );
        return null;
      }

      const bitmap = await createImageBitmap(file);
      try {
        if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
          this.errorMessage.set(
            'La imagen tiene demasiados píxeles. Elige una de hasta 20 megapíxeles.',
          );
          return null;
        }

        const cleanBlob = await this.reencode(bitmap);
        return {
          blob: cleanBlob,
          name: file.name,
        };
      } finally {
        bitmap.close();
      }
    } catch {
      this.errorMessage.set('No se ha podido leer la imagen. Prueba con otro archivo.');
      return null;
    }
  }

  private async detectImageKind(file: File): Promise<ImageKind | null> {
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

  private async reencode(bitmap: ImageBitmap): Promise<Blob> {
    const scale = Math.min(1, MAX_RENDER_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is not available');

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.9),
    );
    if (!blob) throw new Error('Image could not be encoded');
    return blob;
  }

  private toPreparedPhoto(url: string, originalName?: string): PreparedPhoto {
    return {
      id: url,
      url,
      name:
        originalName ??
        decodeURIComponent(new URL(url).pathname.split('/').pop() ?? 'foto.webp'),
    };
  }
}
