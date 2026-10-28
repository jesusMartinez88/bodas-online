import { Component, afterNextRender, HostListener, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PwaPromptComponent } from './components/pwa-prompt/pwa-prompt.component';
import { ExitConfirmModalComponent } from './shared/components/exit-confirm-modal/exit-confirm-modal.component';
import { ExitConfirmService } from './services/exit-confirm.service';
import { AuthService } from './services/auth.service';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, PwaPromptComponent, ExitConfirmModalComponent],
  template: `
    <router-outlet />
    <app-pwa-prompt />
    @if (exitConfirmService.showExitConfirm()) {
      <app-exit-confirm-modal />
    }
  `,
})
export class App {
  exitConfirmService = inject(ExitConfirmService);
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  constructor() {
    afterNextRender(() => {
      // Rehidratar la sesión: la cookie `httpOnly` la envía el navegador por
      // su cuenta, así que el frontend tiene que preguntar al backend quién
      // está conectado (el token ya no está en `localStorage`).
      this.authService.ensureSession();

      // Registrar visita global: una sola llamada por sesión de navegador.
      // El header x-app-visit=1 distingue este ping de monitores externos.
      this.http
        .get(`${environment.apiBaseUrl}/health`, {
          headers: { 'x-app-visit': '1' },
        })
        .subscribe({ error: () => { /* silencioso */ } });

      // Push initial state to handle browser back button
      if (!this.isGuardedRoute(window.location.pathname)) return;
      try {
        history.pushState({ dashboardGuard: true }, '', window.location.href);
      } catch {
        /* ignore */
      }
    });
  }

  @HostListener('window:popstate', ['$event'])
  onPopState(ev: PopStateEvent) {
    // Check if this is a back button press from our guarded route
    if (
      this.isGuardedRoute(window.location.pathname) &&
      ev &&
      (ev.state as { dashboardGuard?: boolean })?.dashboardGuard === true
    ) {
      try {
        history.pushState({ dashboardGuard: true }, '', window.location.href);
      } catch {
        /* ignore */
      }
      this.exitConfirmService.openExitConfirm();
      return;
    }
  }

  private isGuardedRoute(pathname: string): boolean {
    return pathname === '/admin/users' || /^\/[^/]+\/dashboard\/?$/.test(pathname);
  }
}
