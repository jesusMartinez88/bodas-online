import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { PaymentService } from '../../services/payment.service';
import { AuthService } from '../../services/auth.service';
import type { StripePaymentElement } from '@stripe/stripe-js';

/**
 * Pantalla de pago destinada a usuarios que ya tienen cuenta pero
 * NO han completado el pago (porque cerraron el navegador durante
 * el registro, falló el 3DS, etc.).
 *
 * El `paymentGuard` del dashboard redirige aquí cuando `paidAt`
 * es `null`. Al terminar el pago, marcamos `paidAt` optimistamente
 * con `AuthService.markAsPaid()` y navegamos al dashboard del slug.
 *
 * La UI es deliberadamente la misma que el paso 3 del register:
 *   - Stripe Payment Element (si el backend tiene claves)
 *   - Botón demo (si no) — útil para entornos sin Stripe configurado
 *
 * Si el usuario ya pagó y llega aquí por error, lo redirigimos
 * automáticamente a su dashboard.
 */
@Component({
  selector: 'app-complete-payment',
  templateUrl: './complete-payment.component.html',
  styleUrl: './complete-payment.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompletePaymentComponent implements OnInit {
  protected readonly paymentMode = signal<
    'loading' | 'ready' | 'unavailable' | 'error'
  >('loading');
  protected readonly paymentProcessing = signal(false);
  protected readonly paymentError = signal<string | null>(null);
  protected readonly paymentAmountMajor = signal<string>('59,00');
  protected readonly paymentCurrency = signal<string>('eur');

  private readonly paymentElementContainer =
    viewChild<ElementRef<HTMLDivElement>>('paymentElement');
  private mountedPaymentElement: StripePaymentElement | null = null;

  private readonly paymentService = inject(PaymentService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  /**
   * `effect` único que monta/desmonta el Payment Element de Stripe
   * según `paymentMode` y la disponibilidad del contenedor DOM.
   *
   * - `mode === 'ready'` y contenedor disponible → monta (una vez).
   * - Cualquier otro caso → desmonta si había algo.
   */
  private readonly mountEffect = effect(() => {
    const mode = this.paymentMode();
    const container =
      this.paymentElementContainer()?.nativeElement ?? null;

    if (mode !== 'ready' || !container) {
      if (this.mountedPaymentElement) {
        this.paymentService.destroyElements();
        this.mountedPaymentElement = null;
      }
      return;
    }

    if (this.mountedPaymentElement) return;
    this.mountedPaymentElement =
      this.paymentService.mountPaymentElement(container);
  });

  async ngOnInit(): Promise<void> {
    // Si el usuario ya tiene `paidAt` cuando llega aquí (admin lo
    // marcó manualmente, sesión con token viejo + login posterior),
    // salimos al dashboard sin pintar el formulario.
    const user = this.authService.currentUser();
    if (user?.paidAt) {
      this.router.navigate([`/${user.slug}/dashboard`]);
      return;
    }
    await this.initializePayment();
  }

  /**
   * Equivalente a `register.initializePayment`, sin el questionnaire.
   */
  private async initializePayment(): Promise<void> {
    this.paymentMode.set('loading');
    this.paymentError.set(null);
    try {
      const cfg = await this.paymentService.loadConfig();
      const amount = (cfg.amount ?? 0) / 100;
      this.paymentAmountMajor.set(
        amount.toLocaleString('es-ES', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      );
      this.paymentCurrency.set((cfg.currency || 'eur').toUpperCase());

      if (!cfg.enabled || !cfg.publishableKey) {
        this.paymentMode.set('unavailable');
        return;
      }

      const intent = await this.paymentService.createIntent();
      const elements = await this.paymentService.createElements(
        intent.clientSecret,
      );
      if (!elements) {
        this.paymentMode.set('unavailable');
        this.paymentError.set(
          'No pudimos cargar el formulario de pago seguro. Continúa en modo demo.',
        );
        return;
      }
      this.paymentMode.set('ready');
    } catch (err) {
      console.error('[complete-payment] initializePayment error:', err);
      this.paymentMode.set('unavailable');
      this.paymentError.set(
        'No pudimos conectar con el servicio de pagos. Continúa en modo demo.',
      );
    }
  }

  async completePayment(): Promise<void> {
    if (this.paymentProcessing()) return;
    this.paymentError.set(null);
    this.paymentProcessing.set(true);

    if (this.paymentMode() === 'ready') {
      try {
        const returnUrl = `${window.location.origin}/complete-payment?return=1`;
        const result = await this.paymentService.confirmPayment(returnUrl);

        if (result.status === 'succeeded') {
          this.authService.markAsPaid();
          this.paymentProcessing.set(false);
          this.paymentService.destroyElements();
          this.navigateToDashboard();
          return;
        }
        if (result.status === 'processing') {
          this.paymentProcessing.set(false);
          this.paymentError.set(
            'Tu banco está procesando el pago. Te avisaremos en cuanto se confirme.',
          );
          return;
        }
        this.paymentProcessing.set(false);
        this.paymentError.set(
          result.error ||
            'El pago no se completó. Revisa los datos e inténtalo de nuevo.',
        );
        return;
      } catch (err) {
        console.error('[complete-payment] confirmPayment error:', err);
        this.paymentProcessing.set(false);
        this.paymentError.set(
          'No pudimos procesar el pago. Inténtalo de nuevo en unos segundos.',
        );
        return;
      }
    }

    // Modo demo (Stripe no configurado)
    window.setTimeout(() => {
      this.authService.markAsPaid();
      this.paymentProcessing.set(false);
      this.navigateToDashboard();
    }, 700);
  }

  private navigateToDashboard(): void {
    const slug = this.authService.currentUser()?.slug;
    if (slug) {
      this.router.navigate([`/${slug}/dashboard`]);
    } else {
      this.router.navigate(['/login']);
    }
  }
}