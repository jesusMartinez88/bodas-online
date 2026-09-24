import { Injectable, signal, DestroyRef, inject } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class AudioService {
  private readonly destroyRef = inject(DestroyRef);

  private audio: HTMLAudioElement | null = null;
  private source = '';

  // Signals para estado reactivo
  private readonly isPlayingSignal = signal(false);
  private readonly isLoadedSignal = signal(false);
  private readonly volumeSignal = signal(0.3);

  // Computed signals públicos (read-only)
  readonly isPlaying = this.isPlayingSignal.asReadonly();
  readonly isLoaded = this.isLoadedSignal.asReadonly();
  readonly volume = this.volumeSignal.asReadonly();

  constructor() {
    this.initializeAudio();
    this.setupCleanup();
  }

  private initializeAudio(): void {
    this.audio = new Audio();
    this.audio.loop = true;
    this.audio.volume = this.volumeSignal();
    this.audio.preload = 'auto';

    // Event listeners
    this.audio.addEventListener('canplaythrough', () => {
      this.isLoadedSignal.set(true);
      console.log('✅ Audio cargado correctamente');
    });

    this.audio.addEventListener('error', (e) => {
      this.isLoadedSignal.set(false);
      console.error('❌ Error al cargar el audio:', e);
      console.error('Verifica que el archivo existe en: src/assets/{usuario}/music/');
    });
  }

  private setupCleanup(): void {
    this.destroyRef.onDestroy(() => {
      if (this.audio) {
        this.audio.pause();
        this.audio.src = '';
        this.audio = null;
      }
    });
  }

  setSource(src: string): void {
    if (this.audio) {
      this.source = src;
      this.audio.src = src;
      this.isLoadedSignal.set(false);
      console.log('🎵 Intentando cargar música desde:', src);
    }
  }

  async play(): Promise<void> {
    if (!this.audio || this.isPlayingSignal()) {
      return;
    }

    try {
      await this.audio.play();
      this.isPlayingSignal.set(true);
      console.log('▶️ Reproduciendo música');
    } catch (error) {
      console.error('❌ Error al reproducir audio:', error);
      if (error instanceof Error) {
        if (error.name === 'NotSupportedError') {
          throw new Error(
            `No se encontró el archivo de música. Verifica que existe en public/${this.source}`,
            { cause: error },
          );
        } else if (error.name === 'NotAllowedError') {
          throw new Error(
            'El navegador bloqueó la reproducción. Haz clic en el botón para reproducir.',
            { cause: error },
          );
        }
      }
      throw error;
    }
  }

  pause(): void {
    if (this.audio && this.isPlayingSignal()) {
      this.audio.pause();
      this.isPlayingSignal.set(false);
      console.log('⏸️ Música pausada');
    }
  }

  async toggle(): Promise<void> {
    if (this.isPlayingSignal()) {
      this.pause();
    } else {
      await this.play();
    }
  }

  setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.volumeSignal.set(clampedVolume);

    if (this.audio) {
      this.audio.volume = clampedVolume;
    }
  }
}
