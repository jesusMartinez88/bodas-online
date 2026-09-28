import {
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
  signal, OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { PaymentService } from '../../services/payment.service';
import { AuthService } from '../../services/auth.service';

/**
 * Página de retorno de Stripe Hosted Checkout (`success_url`).
 *
 * Stripe redirige aquí con `?session_id={CHECKOUT_SESSION_ID}` cuando el
 * cliente completa el pago. Esta vista:
 *
 *   1. Lee `session_id` del query string (solo informativo — el backend
 *      ya reconcilia la sesión en su webhook usando `metadata.userId`).
 *   2. Hace polling a `GET /api/payments/me` durante unos segundos
 *      porque el webhook de Stripe puede tardar 1-5 s en marcarnos
 *      `User.paidAt`. Cuando lo ve, actualiza la signal local con
 *      `AuthService.markAsPaid()` y navega al dashboard del usuario.
 *   3. Si tras los reintentos el backend sigue diciendo que no hemos
 *      pagado, mostramos un estado "procesando" con botón de reintentar
 *      (caso típico: webhook lento o caído). El usuario nunca se queda
 *      colgado en esta pantalla.
 *
 * Esta ruta NO usa `paymentGuard` a propósito: el usuario aún no está
 * pagado cuando entra y ES esta página la que confirma el pago. Sí
 * exige `authGuard` (tiene que estar logueado para que el backend
 * relacione la sesión con su cuenta).
 */
@Component({
  selector: 'app-payment-success',
  templateUrl: './payment-success.component.html',
  styleUrl: './payment-success.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentSuccessComponent implements OnInit {
  /**
     * `loading` → consultando al backend si ya estamos pagados.
     * `paid`    → webhook confirmado, redirigiendo al dashboard.
     * `pending` → seguimos esperando al webhook (botón reintentar).
     * `error`   → no autenticado o fallo de red inesperado.
     */
  protected readonly status = signal<
    'loading' | 'paid' | 'pending' | 'error'
  >('loading');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly sessionId = signal<string | null>(null);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly paymentService = inject(PaymentService);
  private readonly authService = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);

  /**
   * Número máximo de reintentos para esperar al webhook. Cada reintento
   * espera 2 s, así que en total son ~10 s. Suficiente para el caso
   * normal; si tarda más, mostramos "procesando" y dejamos reintentar.
   */
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly RETRY_DELAY_MS = 2000;

  async ngOnInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      // En SSR no podemos hablar con el backend ni leer query params
      // útiles. La ruta ya se renderiza Client gracias al catch-all
      // de `app.config.server.ts`, pero por si acaso salimos.
      return;
    }

    const user = this.authService.currentUser();
    if (!user) {
      // Sin sesión no podemos reconciliar el pago. authGuard ya
      // debería haber prevenido esto, pero por si el token expiró
      // justo después de pagar, mandamos al login con un mensaje.
      this.errorMessage.set(
        'Tu sesión expiró durante el pago. Inicia sesión de nuevo y el pago debería seguir activo.',
      );
      this.status.set('error');
      this.router.navigate(['/login']);
      return;
    }

    // Guardamos el session_id solo como referencia visible (logs).
    this.sessionId.set(this.route.snapshot.queryParamMap.get('session_id'));

    // Si el usuario ya estaba pagado antes de llegar aquí (caso
    // extraño pero posible: refresh manual, doble redirect, etc.),
    // no esperamos nada y vamos directos al dashboard.
    if (user.paidAt) {
      this.status.set('paid');
      this.redirectToDashboard(user.slug);
      return;
    }

    void this.pollPaymentStatus();
  }

  /**
   * Polling a `/api/payments/me` con backoff fijo. Cuando vemos
   * `paid: true`, marcamos la signal local con `markAsPaid()` y
   * navegamos al dashboard del usuario.
   */
  private async pollPaymentStatus(): Promise<void> {
    this.status.set('loading');

    for (let attempt = 1; attempt <= PaymentSuccessComponent.MAX_ATTEMPTS; attempt++) {
      try {
        const me = await this.paymentService.listMine();
        if (me.paid) {
          // Actualizamos la signal local optimistamente para que el
          // `paymentGuard` del dashboard no nos eche atrás.
          this.authService.markAsPaid(me.paidAt ?? new Date().toISOString());
          this.status.set('paid');
          this.redirectToDashboard(this.authService.currentUser()?.slug ?? '');
          return;
        }
      } catch (err) {
        // Si falla la red en algún intento, seguimos con el siguiente.
        // Solo salimos del bucle si era el último intento.
        console.error('Error al consultar el estado del pago:', err);
        if (attempt === PaymentSuccessComponent.MAX_ATTEMPTS) {
          this.errorMessage.set(
            'No pudimos confirmar el pago con el servidor. Tu pago sí se procesó en Stripe — recarga esta página en unos segundos.',
          );
          this.status.set('pending');
          return;
        }
      }

      if (attempt < PaymentSuccessComponent.MAX_ATTEMPTS) {
        await this.delay(PaymentSuccessComponent.RETRY_DELAY_MS);
      }
    }

    // Agotamos los reintentos sin ver `paid: true`. El webhook aún
    // puede llegar, así que dejamos al usuario reintentar manualmente.
    this.errorMessage.set(
      'El pago se está procesando. Esto puede tardar unos segundos — si pasa mucho tiempo, recarga esta página.',
    );
    this.status.set('pending');
  }

  /** Botón "Reintentar" del estado pending. */
  retry(): void {
    void this.pollPaymentStatus();
  }

  /** Atajo al dashboard sin esperar al webhook (para "Saltar al panel"). */
  goToDashboard(): void {
    const slug = this.authService.currentUser()?.slug;
    if (slug) {
      this.router.navigate([`/${slug}/dashboard`]);
    } else {
      this.router.navigate(['/login']);
    }
  }

  private redirectToDashboard(slug: string): void {
    if (!slug) {
      this.router.navigate(['/login']);
      return;
    }
    // Pequeño delay para que el usuario vea el check de éxito antes
    // de que Angular navegue.
    setTimeout(() => {
      this.router.navigate([`/${slug}/dashboard`]);
    }, 1500);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
