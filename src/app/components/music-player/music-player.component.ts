import { Component, effect, inject, input } from '@angular/core';

import { AudioService } from '../../services/audio.service';

@Component({
  selector: 'app-music-player',
  imports: [],
  templateUrl: './music-player.component.html',
  styleUrl: './music-player.component.css',
})
export class MusicPlayerComponent {
  private readonly audioService = inject(AudioService);

  readonly user = input.required<string>();
  readonly song = input.required<string>();

  // Exponer signals del servicio para el template
  readonly isPlaying = this.audioService.isPlaying;
  readonly isLoaded = this.audioService.isLoaded;

  constructor() {
    // Usar effect para configurar la música cuando el componente se inicializa
    effect(() => {
      // Configurar la ruta de la música de fondo desde el slug de la invitación.
      this.audioService.setSource(`/assets/${this.user()}/music/${this.song()}`);

      // Intentar reproducir automáticamente
      // Nota: Los navegadores pueden bloquear esto si el usuario no ha interactuado
      this.attemptAutoplay();

      // Agregar listeners para interacciones del usuario
      this.addInteractionListeners();
    });
  }

  private async attemptAutoplay(): Promise<void> {
    // Pequeño delay para asegurar que el audio esté cargado
    setTimeout(async () => {
      try {
        if (!this.isPlaying()) {
          await this.audioService.play();
          console.log('🎵 Música iniciada automáticamente');
          this.removeInteractionListeners();
        }
      } catch {
        console.log('ℹ️ Esperando interacción del usuario para iniciar música...');
      }
    }, 500);
  }

  private addInteractionListeners(): void {
    const startAudio = () => this.handleUserInteraction();

    window.addEventListener('scroll', startAudio, { once: true });
    window.addEventListener('mousemove', startAudio, { once: true });
    window.addEventListener('touchstart', startAudio, { once: true });
    window.addEventListener('click', startAudio, { once: true });
  }

  private async handleUserInteraction(): Promise<void> {
    if (!this.isPlaying()) {
      try {
        await this.audioService.play();
        console.log('🎵 Música iniciada tras interacción del usuario');
        this.removeInteractionListeners();
      } catch {
        // Silencioso si falla
      }
    }
  }

  private removeInteractionListeners(): void {
    const startAudio = () => this.handleUserInteraction();
    window.removeEventListener('scroll', startAudio);
    window.removeEventListener('mousemove', startAudio);
    window.removeEventListener('touchstart', startAudio);
    window.removeEventListener('click', startAudio);
  }

  async toggleMusic(): Promise<void> {
    try {
      await this.audioService.toggle();
    } catch (error) {
      console.error('Error al reproducir música:', error);
    }
  }
}
