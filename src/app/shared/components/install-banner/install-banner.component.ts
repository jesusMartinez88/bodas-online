import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PwaService } from '../../../services/pwa.service';

/**
 * Banner recordatorio de instalación de la PWA.
 *
 * Va sobre el título de la sección del panel. A diferencia del modal
 * —que pregunta una vez y se calla 24 horas—, este banner es el
 * recordatorio permanente: se cierra con la X para el resto de la
 * sesión, pero al recargar la página vuelve a aparecer, y no desaparece
 * del todo hasta que la app queda instalada.
 */
@Component({
  selector: 'app-install-banner',
  template: `
    @if (pwaService.showInstallBanner()) {
      <div
        class="install-banner"
        role="region"
        aria-label="Aviso de instalación de la aplicación"
      >
        <span class="install-banner__icon" aria-hidden="true">📲</span>

        <p class="install-banner__text">
          @if (pwaService.isIos()) {
            Instala la app en tu pantalla de inicio: pulsa <strong>Compartir</strong> y luego
            <strong>Añadir a pantalla de inicio</strong>.
          } @else {
            Instala la app para tenerla siempre a mano y abrirla con un toque.
          }
        </p>

        @if (!pwaService.isIos()) {
          <button type="button" class="install-banner__action" (click)="install()">Instalar</button>
        }

        <button
          type="button"
          class="install-banner__close"
          aria-label="Cerrar el aviso de instalación"
          (click)="dismiss()"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    }
  `,
  styles: `
    .install-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      padding: 0.75rem 1rem;
      border-radius: 14px;
      background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%);
      border: 1px solid #fbcfe8;
      box-shadow: 0 2px 8px rgba(236, 72, 153, 0.08);
    }

    .install-banner__icon {
      flex-shrink: 0;
      font-size: 1.25rem;
      line-height: 1;
    }

    .install-banner__text {
      flex: 1;
      margin: 0;
      font-size: 0.9rem;
      line-height: 1.45;
      color: #831843;
    }

    .install-banner__text strong {
      color: #9d174d;
    }

    .install-banner__action {
      flex-shrink: 0;
      background: linear-gradient(135deg, #be185d 0%, #9d174d 100%);
      color: #ffffff;
      border: none;
      padding: 0.55rem 1.1rem;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
      transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;
      box-shadow: 0 4px 12px rgba(190, 24, 93, 0.3);
    }

    .install-banner__action:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(190, 24, 93, 0.4);
    }

    .install-banner__close {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: #be185d;
      font-size: 1.05rem;
      line-height: 1;
      cursor: pointer;
      padding: 0.35rem 0.5rem;
      border-radius: 8px;
      transition: background-color 0.2s ease;
    }

    .install-banner__close:hover {
      background: rgba(236, 72, 153, 0.12);
    }

    .install-banner__action:focus-visible,
    .install-banner__close:focus-visible {
      outline: 3px solid #be185d;
      outline-offset: 2px;
    }

    @media (max-width: 640px) {
      .install-banner {
        flex-wrap: wrap;
      }

      .install-banner__action {
        flex: 1 1 100%;
        order: 3;
      }
    }

    /*
     * En el dashboard, por debajo de 1024 px aparece un botón de menú
     * flotante en la esquina superior derecha. Como va por encima de
     * todo (z-index), hay que dejarle hueco reservado para que no tape
     * la X de cerrar el aviso.
     */
    @media (max-width: 1024px) {
      .install-banner {
        padding-right: 4.5rem;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InstallBannerComponent {
  readonly pwaService = inject(PwaService);

  /** Abre el diálogo nativo de instalación del navegador. */
  install(): void {
    void this.pwaService.installApp();
  }

  /** Cierra el banner para el resto de la sesión. */
  dismiss(): void {
    this.pwaService.dismissInstallBanner();
  }
}
