import {
  Injectable,
  computed,
  signal,
  inject,
  PLATFORM_ID,
  effect,
  untracked,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from './auth.service';

/**
 * Evento `beforeinstallprompt`.
 *
 * No está en los tipos de DOM de TypeScript porque es una API
 * experimental de Chromium: solo la disparan Chrome, Edge y Samsung
 * Internet. Ni Safari (tampoco en iOS) ni Firefox la implementan.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** Clave de `localStorage` donde se guarda la fecha del último rechazo. */
const DISMISSED_KEY = 'pwa-install-dismissed';

/** Tras rechazar el aviso no se vuelve a mostrar durante 24 horas. */
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Retardo antes de mostrar el aviso.
 *
 * No queremos interrumpir al usuario justo cuando aterriza en su panel:
 * le damos un margen para que se acomode.
 */
const PROMPT_DELAY_MS = 3000;

/** Cada cuánto se comprueba si hay una versión nueva del service worker. */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

@Injectable({
  providedIn: 'root',
})
export class PwaService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly authService = inject(AuthService);

  /** Evento `beforeinstallprompt` capturado, pendiente de usar. */
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  /** Temporizador del retardo previo a mostrar el aviso. */
  private promptTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * ¿El navegador nos ha dado el evento `beforeinstallprompt`?
   *
   * Es la señal de que el navegador **puede** instalar la app. El aviso
   * solo se muestra después de que esto sea `true` (o en iOS, donde no
   * existe el evento y mostramos una guía manual).
   */
  readonly canInstallNatively = signal(false);

  /**
   * ¿Estamos en iOS/iPadOS?
   *
   * En iOS **ningún** navegador dispara `beforeinstallprompt`: todos
   * usan WebKit y WebKit no implementa la API. La única forma de
   * instalar es a mano desde el menú "Compartir", así que ahí mostramos
   * una guía con los pasos en vez de un botón que no puede funcionar.
   */
  readonly isIos = signal(false);

  /**
   * ¿La app ya está instalada y se está ejecutando en modo standalone?
   *
   * Si lo está, no tiene sentido ofrecer instalarla otra vez.
   */
  readonly isInstalled = signal(false);

  /** ¿Hay que mostrar el aviso de instalación? */
  readonly showInstallPrompt = signal(false);

  /**
   * ¿Está pendiente de mostrarse el aviso de instalación (el modal)?
   *
   * Mientras espera sus 3 segundos, el banner se aparta: no queremos los
   * dos a la vez en pantalla.
   */
  readonly installModalPending = signal(false);

  /**
   * ¿El usuario ha cerrado el banner en esta sesión?
   *
   * **No se guarda en `localStorage`**: al recargar la página vuelve a
   * aparecer. Solo desaparece para siempre cuando la app queda instalada.
   */
  readonly installBannerDismissed = signal(false);

  /**
   * ¿Hay que mostrar el banner de instalación?
   *
   * Es el recordatorio permanente: aparece sobre el título de la sección
   * del panel hasta que el usuario cierre la app (o la instale), y el
   * modal deja de preguntar.
   */
  readonly showInstallBanner = computed(
    () =>
      this.isInstallAvailable() &&
      !this.showInstallPrompt() &&
      !this.installModalPending() &&
      !this.installBannerDismissed(),
  );

  /** ¿Hay una versión nueva disponible? */
  readonly showUpdatePrompt = signal(false);

  constructor() {
    // En SSR no hay `window` ni `navigator`: no hay PWA que instalar.
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.isIos.set(this.detectIos());
    this.isInstalled.set(this.detectInstalled());

    this.listenInstallEvents();
    this.watchAuthState();
    this.registerServiceWorker();
  }

  /**
   * Avisa de que el usuario ha iniciado sesión.
   *
   * El aviso también se dispara solo cuando cambia el estado de sesión
   * (ver `watchAuthState`), así que esta llamada solo sirve para
   * enseñarlo de inmediato, sin esperar al siguiente ciclo de detección
   * de cambios.
   */
  onUserLoggedIn(): void {
    this.scheduleInstallPrompt();
  }

  /**
   * Lanza el diálogo nativo de instalación.
   *
   * En iOS no hay diálogo: `beforeinstallprompt` no existe, así que el
   * aviso muestra una guía manual en lugar de este botón.
   */
  async installApp(): Promise<void> {
    const deferred = this.deferredPrompt;
    if (!deferred) {
      return;
    }

    // `prompt()` solo se puede llamar una vez por evento.
    this.deferredPrompt = null;
    this.showInstallPrompt.set(false);

    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    console.log(`[pwa] El usuario ${outcome === 'accepted' ? 'aceptó' : 'rechazó'} la instalación`);

    if (outcome === 'accepted') {
      this.clearDismissed();
    }
  }

  /** Cierra el aviso y no vuelve a mostrarse durante 24 horas. */
  dismissInstallPrompt(): void {
    this.showInstallPrompt.set(false);

    try {
      localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    } catch {
      // `localStorage` puede estar bloqueado (modo privado). No es motivo
      // para esconder el aviso: simplemente se repetirá la próxima vez.
    }
  }

  /**
   * Cierra el banner de instalación.
   *
   * Solo afecta a esta sesión: no se guarda nada, así que al recargar la
   * página el banner vuelve a aparecer (y sigue ahí hasta que la app
   * quede instalada).
   */
  dismissInstallBanner(): void {
    this.installBannerDismissed.set(true);
  }

  /** Recarga la página para aplicar la versión nueva. */
  reloadApp(): void {
    window.location.reload();
  }

  /** Cierra el aviso de actualización sin recargar. */
  dismissUpdatePrompt(): void {
    this.showUpdatePrompt.set(false);
  }

  /**
   * Avisa de los cambios de sesión.
   *
   * El aviso de instalación se dispara cuando el usuario **está
   * autenticado**, no cuando "acaba de escribir su contraseña". Antes
   * solo se escuchaba el login manual, así que a quien ya tenía la
   * sesión abierta —la cookie `httpOnly` se rehidrata sola al recargar
   * la página— el aviso nunca le aparecía, que es justo el caso más
   * habitual.
   */
  private watchAuthState(): void {
    effect(() => {
      // Al leer la signal de sesión, el efecto vuelve a ejecutarse
      // cuando cambia: login, logout o rehidratación al cargar.
      const authenticated = this.authService.isAuthenticated();
      if (!authenticated) {
        return;
      }
      untracked(() => this.scheduleInstallPrompt());
    });
  }

  /**
   * Programa el aviso de instalación si se dan las condiciones.
   *
   * Se llama desde dos sitios y el resultado es el mismo:
   *  - cuando el usuario se autentica, y
   *  - cuando el navegador nos da el evento `beforeinstallprompt`.
   *
   * Así da igual el orden: si el evento llega antes que la sesión, o al
   * revés, el aviso aparece igual.
   */
  private scheduleInstallPrompt(): void {
    if (this.promptTimer !== null) {
      return;
    }
    if (!this.canOfferInstall()) {
      return;
    }

    // Mientras el modal espera sus 3 segundos, el banner se aparta: no
    // queremos los dos a la vez en pantalla.
    this.installModalPending.set(true);

    this.promptTimer = setTimeout(() => {
      this.promptTimer = null;
      this.installModalPending.set(false);
      if (this.canOfferInstall()) {
        this.showInstallPrompt.set(true);
      }
    }, PROMPT_DELAY_MS);
  }

  /**
   * ¿Se puede instalar la app para este usuario en este navegador?
   *
   * Es la condición base, la que comparten el modal y el banner: el
   * usuario está dentro, la app no está instalada todavía y el navegador
   * sabe instalarla.
   */
  private isInstallAvailable(): boolean {
    if (!this.authService.isAuthenticated()) {
      return false;
    }
    if (this.isInstalled()) {
      return false;
    }
    // En Chromium hace falta el evento; en iOS no existe y mostramos la
    // guía manual de instalación.
    return this.canInstallNatively() || this.isIos();
  }

  /** ¿Se cumplen ahora mismo todas las condiciones para ofrecer la instalación? */
  private canOfferInstall(): boolean {
    if (this.showInstallPrompt()) {
      return false;
    }
    // El modal no vuelve a preguntar durante 24 horas. El banner sí: es
    // el recordatorio permanente que queda en su lugar.
    if (this.isDismissedRecently()) {
      return false;
    }
    return this.isInstallAvailable();
  }

  /**
   * Registra los eventos de instalación del navegador.
   *
   * `beforeinstallprompt` se dispara una sola vez y muy pronto: si el
   * listener no está puesto cuando ocurre, el evento se pierde para
   * siempre. Por eso se registra nada más arrancar, antes incluso de
   * registrar el service worker.
   */
  private listenInstallEvents(): void {
    window.addEventListener('beforeinstallprompt', (event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      // Sin `preventDefault()` Chrome enseña su propio mini-infobar.
      installEvent.preventDefault();
      this.deferredPrompt = installEvent;
      this.canInstallNatively.set(true);
      this.scheduleInstallPrompt();
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstallNatively.set(false);
      this.isInstalled.set(true);
      this.showInstallPrompt.set(false);
      this.clearDismissed();
    });
  }

  /**
   * Registra el service worker y avisa cuando hay una versión nueva.
   */
  private registerServiceWorker(): void {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    // En el servidor de desarrollo de Angular el service worker estorba
    // (cachea lo que se está recompilando). Se desactiva solo ahí; un
    // build de producción servido en local (preview) sí lo registra, para
    // poder probar el flujo completo de instalación.
    if (this.isAngularDevServer()) {
      console.log('[pwa] Servidor de desarrollo: service worker desactivado');
      return;
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[pwa] Service worker registrado');

        // Verificar actualizaciones cada hora.
        setInterval(() => registration.update(), UPDATE_CHECK_INTERVAL_MS);

        // Detectar cuando hay una nueva versión disponible.
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) {
            return;
          }
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this.showUpdatePrompt.set(true);
            }
          });
        });
      })
      .catch((error) => {
        console.error('[pwa] Error al registrar el service worker:', error);
      });
  }

  /** ¿Estamos en el servidor de desarrollo de Angular (`ng serve`)? */
  private isAngularDevServer(): boolean {
    const isLocal =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocal && window.location.port === '4200';
  }

  /** ¿La app está corriendo ya como aplicación instalada? */
  private detectInstalled(): boolean {
    const standalone = window.matchMedia('(display-mode: standalone)').matches;
    const fullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
    const minimalUi = window.matchMedia('(display-mode: minimal-ui)').matches;
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;

    return standalone || fullscreen || minimalUi || iosStandalone;
  }

  /** ¿Estamos en iOS o iPadOS? */
  private detectIos(): boolean {
    const nav = navigator as Navigator & { maxTouchPoints?: number };
    const userAgent = nav.userAgent ?? '';

    // iPadOS 13+ se presenta como un Mac: se distingue por los puntos de
    // toque táctiles.
    const isIpadOs = /Mac/.test(userAgent) && (nav.maxTouchPoints ?? 0) > 1;

    return /iPad|iPhone|iPod/.test(userAgent) || isIpadOs;
  }

  /** ¿Se rechazó el aviso hace menos de 24 horas? */
  private isDismissedRecently(): boolean {
    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY);
      if (!dismissed) {
        return false;
      }

      const dismissedAt = Number.parseInt(dismissed, 10);
      if (!Number.isFinite(dismissedAt)) {
        return false;
      }

      return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
    } catch {
      // `localStorage` bloqueado: no podemos saber si se rechazó, así que
      // mostramos el aviso (si no podemos guardarlo, tampoco importa).
      return false;
    }
  }

  /** Olvida el último rechazo. */
  private clearDismissed(): void {
    try {
      localStorage.removeItem(DISMISSED_KEY);
    } catch {
      // Sin efecto: solo afecta a cuándo se repite el aviso.
    }
  }
}
