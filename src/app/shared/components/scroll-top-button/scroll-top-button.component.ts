import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

/**
 * Botón flotante "volver arriba".
 *
 * Aparece cuando el visitante ha hecho scroll y lo devuelve al inicio de
 * la página. Vive en `shared/` porque sirve tanto para la landing como
 * para cualquier otra página pública larga (contacto, invitaciones, …).
 *
 * Accesibilidad:
 *  - Es un `<button>` real, así que es alcanzable con teclado.
 *  - Cuando está oculto usa `visibility: hidden`, por lo que sale del
 *    orden de tabulación y del árbol de accesibilidad.
 *  - Tras activarlo, el foco se mueve al inicio del documento para que
 *    quien navega con teclado no se quede "en el aire" (el botón desaparece).
 *  - Respeta `prefers-reduced-motion`.
 */
@Component({
  selector: 'app-scroll-top-button',
  template: `
    <button
      type="button"
      class="scroll-top-button"
      aria-label="Volver al inicio de la página"
      (click)="scrollToTop()"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 19V5"></path>
        <path d="m5 12 7-7 7 7"></path>
      </svg>
    </button>
  `,
  styles: `
    :host {
      position: fixed;
      right: 1.5rem;
      bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
      z-index: 90;
      opacity: 0;
      visibility: hidden;
      transform: translateY(0.75rem);
      transition:
        opacity 0.25s ease,
        transform 0.25s ease,
        visibility 0s linear 0.25s;
    }

    :host(.is-visible) {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
      transition-delay: 0s;
    }

    .scroll-top-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 3rem;
      height: 3rem;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.25);
      border-radius: 999px;
      background: linear-gradient(135deg, #db2777 0%, #be185d 100%);
      color: #ffffff;
      cursor: pointer;
      box-shadow: 0 10px 26px rgba(190, 24, 93, 0.38);
      transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;
    }

    .scroll-top-button:hover {
      transform: translateY(-3px);
      box-shadow: 0 14px 30px rgba(190, 24, 93, 0.48);
    }

    .scroll-top-button:active {
      transform: translateY(-1px);
    }

    .scroll-top-button:focus-visible {
      outline: 3px solid #831843;
      outline-offset: 3px;
    }

    @media (max-width: 640px) {
      :host {
        right: 1rem;
        bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
      }

      .scroll-top-button {
        width: 2.75rem;
        height: 2.75rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host,
      .scroll-top-button {
        transition: none;
      }
    }
  `,
  host: {
    '(window:scroll)': 'onWindowScroll()',
    '[class.is-visible]': 'visible()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScrollTopButtonComponent {
  /** Píxeles de scroll a partir de los cuales se muestra el botón. */
  readonly threshold = input<number>(400);

  /** Selector del elemento al que se mueve el foco tras volver arriba. */
  readonly focusTarget = input<string>('main');

  readonly visible = signal(false);

  private rafId: number | null = null;

  /**
   * Se actualiza solo cuando se cruza el umbral, así que el scroll no
   * provoca re-renderizados continuos.
   */
  onWindowScroll(): void {
    if (this.rafId !== null) return;

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      const shouldShow = window.scrollY > this.threshold();
      if (shouldShow !== this.visible()) {
        this.visible.set(shouldShow);
      }
    });
  }

  scrollToTop(): void {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });

    // El botón desaparece al llegar arriba: movemos el foco al inicio
    // del contenido para no dejar al usuario de teclado sin referencia.
    const target = document.querySelector<HTMLElement>(this.focusTarget());
    target?.focus({ preventScroll: true });
  }
}
