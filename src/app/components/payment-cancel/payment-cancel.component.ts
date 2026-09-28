import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Página de retorno de Stripe Hosted Checkout (`cancel_url`).
 *
 * Stripe redirige aquí cuando el cliente pulsa "Volver" en la página
 * de pago o cierra la pestaña antes de pagar. Esta vista:
 *
 *   - Informa al usuario de que NO se ha realizado ningún cargo.
 *   - Le da dos salidas razonables: reintentar el pago
 *     (`/complete-payment`) o volver al inicio.
 *
 * NO usa `paymentGuard`: el usuario aún no ha pagado cuando entra aquí,
 * y debe poder navegar libremente aunque su `paidAt` siga siendo null.
 * Sí exige `authGuard` para mantener coherencia con el resto del flujo
 * de pago (tiene que estar identificado para que el backend sepa a qué
 * cuenta asociar un futuro intento).
 */
@Component({
  selector: 'app-payment-cancel',
  templateUrl: './payment-cancel.component.html',
  styleUrl: './payment-cancel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentCancelComponent {
  private readonly router = inject(Router);

  /** Reintenta el pago: lo mandamos a la pantalla de pago ya montada. */
  retryPayment(): void {
    this.router.navigate(['/complete-payment']);
  }

  /** Vuelve al inicio (landing pública). */
  goHome(): void {
    this.router.navigate(['/']);
  }
}