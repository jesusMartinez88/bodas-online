import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { PwaService } from '../../services/pwa.service';

@Component({
  selector: 'app-pwa-prompt',
  templateUrl: './pwa-prompt.component.html',
  styleUrl: './pwa-prompt.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscapeKey()',
  },
})
export class PwaPromptComponent {
  readonly pwaService = inject(PwaService);
  private readonly router = inject(Router);

  /**
   * ¿Estamos en una zona de la app donde tiene sentido ofrecer instalar?
   *
   * Antes se comprobaba `url.startsWith('/dashboard')`, pero el panel
   * cuelga de `/:tenant/dashboard` y el admin de `/admin/users`: ese
   * `startsWith` **nunca** era cierto, así que el aviso no se mostraba
   * ni siquiera con el evento de instalación capturado y el usuario
   * autenticado.
   */
  readonly isInAppArea = signal(false);

  /** Diálogo de instalación, para moverle el foco al abrirlo. */
  private readonly installDialog = viewChild<ElementRef<HTMLElement>>('installDialog');

  constructor() {
    this.updateRoute(this.router.url);

    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => this.updateRoute(event.url));

    effect(() => {
      if (!this.isInAppArea() || !this.pwaService.showInstallPrompt()) {
        return;
      }
      // El foco entra en el diálogo para que se pueda cerrar con el
      // teclado, no solo con el ratón.
      queueMicrotask(() => this.installDialog()?.nativeElement.focus());
    });
  }

  installApp(): void {
    void this.pwaService.installApp();
  }

  dismissInstall(): void {
    this.pwaService.dismissInstallPrompt();
  }

  reloadApp(): void {
    this.pwaService.reloadApp();
  }

  dismissUpdate(): void {
    this.pwaService.dismissUpdatePrompt();
  }

  /** Escape cierra el aviso que esté abierto. */
  onEscapeKey(): void {
    if (this.pwaService.showInstallPrompt()) {
      this.dismissInstall();
      return;
    }
    if (this.pwaService.showUpdatePrompt()) {
      this.dismissUpdate();
    }
  }

  private updateRoute(url: string): void {
    const path = url.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
    const isTenantDashboard = /^\/[^/]+\/dashboard$/.test(path);
    const isAdminArea = path === '/admin/users';

    this.isInAppArea.set(isTenantDashboard || isAdminArea);
  }
}
