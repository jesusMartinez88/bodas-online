import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import type { Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  PaymentConfig,
  PaymentIntentResponse,
  PaymentsListResponse,
  CheckoutSessionResponse,
} from '../../types/api';

/**
 * Servicio de pagos.
 *
 * Encapsula dos cosas:
 *
 *  1. **Llamadas al backend** (`/api/payments/*`) para pedir la
 *     configuración, crear un PaymentIntent y listar pagos.
 *  2. **Carga de Stripe.js** (`@stripe/stripe-js`). El SDK es
 *     pesado (~80KB gz), así que se carga de forma lazy solo cuando
 *     el usuario llega al paso 3 del registro. La instancia de
 *     `Stripe` se cachea en memoria para no recargarla si el usuario
 *     navega entre pasos.
 *
 * Si el backend no tiene Stripe configurado (`enabled: false`),
 * `PaymentService` queda en modo "no-op" y el register muestra el
 * botón demo. Esto permite trabajar en local sin claves.
 *
 * PCI DSS: nunca tocan datos de tarjeta en el navegador. Stripe
 * renderiza el Payment Element en un iframe y tokeniza los datos
 * directamente contra sus servidores.
 */
@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private baseUrl = environment.apiBaseUrl;

  /**
   * Estado cacheado. `null` hasta que llamemos `loadConfig()` por
   * primera vez (o `init()` si necesitamos Stripe.js).
   */
  private config = signal<PaymentConfig | null>(null);
  private stripePromise: Promise<Stripe | null> | null = null;
  private currentElements: StripeElements | null = null;
  private currentPaymentElement: StripePaymentElement | null = null;

  /** Lee `/api/payments/config` y cachea el resultado en signal. */
  async loadConfig(): Promise<PaymentConfig> {
    if (this.config()) {
      return this.config()!;
    }
    const response = await firstValueFrom(
      this.http.get<PaymentConfig>(`${this.baseUrl}/api/payments/config`),
    );
    this.config.set(response);
    return response;
  }

  /**
   * Devuelve `true` si el backend tiene Stripe configurado y
   * debemos mostrar el checkout real. Si devuelve `false`, el
   * register mostrará el botón demo.
   */
  isLiveCheckoutAvailable(): boolean {
    const cfg = this.config();
    return !!cfg?.enabled && !!cfg.publishableKey;
  }

  /**
   * Pide al backend que cree un PaymentIntent. El backend ya
   * adjunta el `userId` desde el JWT; el frontend solo necesita
   * estar autenticado.
   */
  async createIntent(): Promise<PaymentIntentResponse> {
    return firstValueFrom(
      this.http.post<PaymentIntentResponse>(
        `${this.baseUrl}/api/payments/create-intent`,
        {},
      ),
    );
  }

  /** Historial de pagos del usuario actual. */
  async listMine(): Promise<PaymentsListResponse> {
    return firstValueFrom(
      this.http.get<PaymentsListResponse>(`${this.baseUrl}/api/payments/me`),
    );
  }

  /**
   * Pide al backend una **Checkout Session** (hosted_page) para redirigir
   * al cliente a la página de pago de Stripe. Devuelve la URL a la que
   * el frontend debe navegar (`window.location.href = url`).
   *
   * Convive con `createIntent()` (Payment Element). El caller decide
   * qué flujo usar; este método NO carga Stripe.js porque todo ocurre
   * en la página hosted de Stripe.
   */
  async createCheckoutSession(): Promise<CheckoutSessionResponse> {
    return firstValueFrom(
      this.http.post<CheckoutSessionResponse>(
        `${this.baseUrl}/api/payments/create-checkout-session`,
        {},
      ),
    );
  }

  /**
   * Carga Stripe.js con la publishable key. Es seguro llamar varias
   * veces: la promesa queda cacheada y solo se carga una vez.
   *
   * Devuelve `null` si no estamos en el browser, si no hay publishable
   * key configurada, o si la carga falla (esto último hace que el
   * register caiga al modo demo).
   */
  async initStripe(): Promise<Stripe | null> {
    if (!isPlatformBrowser(this.platformId)) return null;

    if (this.stripePromise) return this.stripePromise;

    const cfg = await this.loadConfig();
    const pk = cfg?.publishableKey;
    if (!pk) return null;

    this.stripePromise = (async () => {
      try {
        // Lazy-load del SDK: así Stripe.js solo entra al bundle cuando
        // el usuario llega al paso 3 del registro. Como `import type` arriba
        // borra los tipos, este `await import(...)` es la única referencia
        // runtime al módulo, y solo se evalúa aquí. Beneficio: tests no
        // disparan la carga del script remoto (bloqueada por happy-dom).
        const { loadStripe } = await import('@stripe/stripe-js');
        return await loadStripe(pk);
      } catch (err) {
        console.error('[payment] loadStripe failed:', err);
        return null;
      }
    })();
    return this.stripePromise;
  }

  /**
   * Crea un `Elements` ligado a un `clientSecret`. El frontend lo
   * usa para montar el Payment Element en el DOM. Guardamos la
   * referencia para poder destruirlos al salir del paso 3.
   */
  async createElements(clientSecret: string): Promise<StripeElements | null> {
    const stripe = await this.initStripe();
    if (!stripe) return null;

    // Cargamos config solo para el efecto secundario de cachear el
    // `publishableKey` por si `initStripe` se ha saltado por SSR.
    await this.loadConfig();

    const elements = stripe.elements({
      clientSecret,
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#be185d', // coincide con el rosa de la landing
          colorBackground: '#ffffff',
          colorText: '#1f2937',
          fontFamily: 'system-ui, sans-serif',
          borderRadius: '12px',
        },
      },
      locale: 'es',
    });

    this.currentElements = elements;
    return elements;
  }

  /** Monta el Payment Element en un contenedor DOM. */
  mountPaymentElement(container: HTMLElement): StripePaymentElement | null {
    if (!this.currentElements) return null;
    const paymentElement = this.currentElements.create('payment', {
      layout: 'tabs',
    });
    paymentElement.mount(container);
    this.currentPaymentElement = paymentElement;
    return paymentElement;
  }

  /**
   * Confirma el PaymentIntent con los datos del Payment Element.
   *
   * Usa `redirect: 'if_required'`: si el banco exige 3DS Challenge,
   * Stripe redirige a la página de challenge y vuelve al `return_url`.
   * Si NO requiere 3DS, devuelve el PaymentIntent ya confirmado.
   *
   * Devuelve `{ status: 'succeeded' | 'requires_payment_method' | ...,
   * error?: string }` para que el caller decida cómo seguir.
   */
  async confirmPayment(returnUrl: string): Promise<ConfirmResult> {
    const stripe = await this.initStripe();
    if (!stripe || !this.currentElements) {
      return { status: 'failed', error: 'Stripe no inicializado.' };
    }

    const result = await stripe.confirmPayment({
      elements: this.currentElements,
      confirmParams: {
        return_url: returnUrl,
      },
      redirect: 'if_required',
    });

    if (result.error) {
      return {
        status: 'failed',
        error: result.error.message ?? 'Pago rechazado.',
      };
    }

    if (result.paymentIntent?.status === 'succeeded') {
      return { status: 'succeeded' };
    }

    if (result.paymentIntent?.status === 'processing') {
      return { status: 'processing' };
    }

    return {
      status: result.paymentIntent?.status ?? 'unknown',
      error: 'El pago requiere acción adicional.',
    };
  }

  /** Limpia el Elements cacheado. Llamar al salir del paso 3. */
  destroyElements(): void {
    // Stripe.js no expone `elements.unmount()`; hay que desmontar
    // cada Element individual. Trackeamos el Payment Element en
    // `currentPaymentElement` para poder liberarlo aquí.
    if (this.currentPaymentElement) {
      try {
        this.currentPaymentElement.unmount();
      } catch {
        // El contenedor puede haber desaparecido del DOM; swallow.
      }
      this.currentPaymentElement = null;
    }
    this.currentElements = null;
  }
}

export interface ConfirmResult {
  status: 'succeeded' | 'processing' | 'failed' | 'unknown' | string;
  error?: string;
}