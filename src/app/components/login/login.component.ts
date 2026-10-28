import { Component, inject, signal, effect, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { form, FormField, submit, required, minLength } from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PwaService } from '../../services/pwa.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormField, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private pwaService = inject(PwaService);
  private platformId = inject(PLATFORM_ID);

  // Model signal - never use null/undefined as initial values
  protected readonly loginModel = signal({
    username: '',
    password: '',
    captcha: '',
  });

  // Signal Forms
  protected readonly loginForm = form(this.loginModel, (s) => {
    required(s.username, { message: 'El usuario es obligatorio' });
    minLength(s.username, 4, { message: 'Mínimo 4 caracteres' });
    required(s.password, { message: 'La contraseña es obligatoria' });
    minLength(s.password, 4, { message: 'Mínimo 4 caracteres' });
    required(s.captcha, { message: 'Resuelve el CAPTCHA' });
  });

  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  loadingMessage = signal<string>('');

  /**
   * El guard manda al login con `?error=conexion` cuando el backend no ha
   * podido responder. No es un fallo de credenciales, es de conexión: se dice
   * explícitamente y se ofrece reintentar.
   */
  readonly connectionError = signal(false);
  readonly isRetrying = signal(false);

  // CAPTCHA properties
  captchaQuestion = signal('');
  private correctCaptchaAnswer = 0;

  private intervalId?: ReturnType<typeof setInterval>;
  private loadingStartTime = 0;

  constructor() {
    this.generateCaptcha();

    if (this.route.snapshot.queryParamMap.get('error') === 'conexion') {
      this.connectionError.set(true);
    }

    // El `setInterval` solo se registra en el navegador. En SSR, registrar
    // un interval deja un timer colgando en el server que nunca se limpia.
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // effect() corre fuera de zona — no necesita NgZone ni ChangeDetectorRef.
    // Las escrituras a signals dentro del effect están permitidas por defecto
    // en Angular 19+; el flag `allowSignalWrites` está deprecado y es no-op.
    effect(() => {
      if (this.isLoading()) {
        this.loadingStartTime = Date.now();
        this.intervalId = setInterval(() => {
          const elapsed = Date.now() - this.loadingStartTime;
          if (elapsed >= 45000) {
            this.loadingMessage.set('Ya casi estamos, gracias por esperar...');
          } else if (elapsed >= 30000) {
            this.loadingMessage.set('El servidor está despertando, solo un momento más...');
          } else if (elapsed >= 15000) {
            this.loadingMessage.set('Gracias por tu paciencia, casi listo...');
          } else if (elapsed >= 5000) {
            this.loadingMessage.set(
              'El servidor se está iniciando, esto puede tardar un minuto...',
            );
          }
        }, 1000);
      } else {
        clearInterval(this.intervalId);
        this.intervalId = undefined;
        this.loadingMessage.set('');
      }
    });
  }

  generateCaptcha() {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    this.correctCaptchaAnswer = num1 + num2;
    this.captchaQuestion.set(`${num1} + ${num2}`);

    // Reset captcha field in form model
    this.loginModel.update((m) => ({ ...m, captcha: '' }));
  }

  /**
   * Reintenta la consulta de sesión tras un fallo de conexión.
   *
   * Si el backend vuelve a responder y la sesión sigue viva, entra al panel
   * sin pedir credenciales otra vez. Si responde pero no hay sesión, entonces
   * sí que la sesión caducó de verdad y se quita el aviso de conexión.
   */
  async retryConnection(): Promise<void> {
    this.isRetrying.set(true);
    try {
      await this.authService.retrySession();

      const user = this.authService.currentUser();
      if (user) {
        const target = user.role === 'admin' ? ['/admin/users'] : [`/${user.slug}/dashboard`];
        this.router.navigate(target, { replaceUrl: true });
        return;
      }

      this.connectionError.set(false);
    } finally {
      this.isRetrying.set(false);
    }
  }

  onSubmit() {
    submit(this.loginForm, async () => {
      const formValue = this.loginModel();
      const userAnswer = parseInt(formValue.captcha || '', 10);

      if (userAnswer !== this.correctCaptchaAnswer) {
        this.errorMessage.set('CAPTCHA incorrecto. Por favor, intenta de nuevo.');
        this.generateCaptcha();
        return;
      }

      this.isLoading.set(true);
      this.errorMessage.set(null);

      try {
        await new Promise<void>((resolve, reject) => {
          this.authService
            .login({
              username: formValue.username,
              password: formValue.password,
            })
            .subscribe({
              next: () => resolve(),
              error: () => reject(),
            });
        });

        // Notificar al servicio PWA que el usuario se ha logueado
        this.pwaService.onUserLoggedIn();

        // Decidir destino según rol: admin va al panel, el resto a su dashboard.
        // El `tap` de AuthService.login() ya actualizó la signal del usuario
        // antes de que el subscribe.next se disparase (tap corre antes que
        // next). La cookie de sesión la ha puesto el backend.
        const user = this.authService.currentUser();
        const isAdmin = user?.role === 'admin';
        const slug = user?.slug || formValue.username;

        const target = isAdmin
          ? ['/admin/users']
          : [`/${slug}/dashboard`];

        // Usar replaceUrl para que la página de login no quede en el historial
        // y al pulsar "atrás" no vuelva al login
        this.router.navigate(target, { replaceUrl: true });
      } catch {
        this.errorMessage.set('Credenciales incorrectas. Por favor, inténtalo de nuevo.');
        this.generateCaptcha();
      } finally {
        this.isLoading.set(false);
      }
    });
  }
}
