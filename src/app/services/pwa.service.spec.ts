import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { PwaService } from './pwa.service';

/**
 * Aviso de instalación de la PWA.
 *
 * Estos tests cubren el flujo que fallaba: el aviso se ofrecía solo
 * después de un login **manual**, así que a quien ya tenía la sesión
 * abierta (la cookie `httpOnly` se rehidrata sola al cargar la página)
 * nunca le aparecía. Además, el componente lo mostraba únicamente en
 * rutas que no existen (`/dashboard`), de modo que tampoco se pintaba.
 */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** Retardo con el que el servicio muestra el aviso. */
const PROMPT_DELAY_MS = 3000;

describe('PwaService (aviso de instalación)', () => {
  let pwa: PwaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    pwa = TestBed.inject(PwaService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    httpMock.verify();
    localStorage.clear();
  });

  /** Simula el evento que dispara Chrome cuando la app es instalable. */
  function dispatchInstallEvent(): InstallEvent {
    const event = new Event('beforeinstallprompt') as InstallEvent;
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome: 'accepted' as const });
    window.dispatchEvent(event);
    return event;
  }

  /** Abre sesión como lo haría el backend al rehidratar la cookie. */
  function signIn(): void {
    void TestBed.inject(AuthService).ensureSession();
    httpMock
      .expectOne((req) => req.url.includes('/api/auth/me'))
      .flush({
        success: true,
        user: {
          id: 7,
          username: 'jesus',
          email: null,
          role: 'user',
          slug: 'jesus',
          paidAt: '2026-01-01T00:00:00.000Z',
        },
      });
    TestBed.tick();
  }

  it('muestra el aviso cuando la sesión ya estaba abierta y llega el evento de instalación', () => {
    dispatchInstallEvent();
    signIn();

    vi.advanceTimersByTime(PROMPT_DELAY_MS);

    expect(pwa.showInstallPrompt()).toBe(true);
  });

  it('muestra el aviso cuando el evento de instalación llega después del inicio de sesión', () => {
    signIn();
    vi.advanceTimersByTime(PROMPT_DELAY_MS);
    expect(pwa.showInstallPrompt()).toBe(false);

    dispatchInstallEvent();
    vi.advanceTimersByTime(PROMPT_DELAY_MS);

    expect(pwa.showInstallPrompt()).toBe(true);
  });

  it('no muestra el aviso si no hay sesión', () => {
    dispatchInstallEvent();

    vi.advanceTimersByTime(PROMPT_DELAY_MS);

    expect(pwa.showInstallPrompt()).toBe(false);
  });

  it('no vuelve a mostrar el aviso durante 24 horas tras rechazarlo', () => {
    dispatchInstallEvent();
    signIn();
    vi.advanceTimersByTime(PROMPT_DELAY_MS);
    expect(pwa.showInstallPrompt()).toBe(true);

    pwa.dismissInstallPrompt();
    expect(pwa.showInstallPrompt()).toBe(false);

    pwa.onUserLoggedIn();
    vi.advanceTimersByTime(PROMPT_DELAY_MS);

    expect(pwa.showInstallPrompt()).toBe(false);
  });

  it('vuelve a mostrar el aviso si el rechazo fue hace más de 24 horas', () => {
    localStorage.setItem('pwa-install-dismissed', String(Date.now() - 25 * 60 * 60 * 1000));

    dispatchInstallEvent();
    signIn();
    vi.advanceTimersByTime(PROMPT_DELAY_MS);

    expect(pwa.showInstallPrompt()).toBe(true);
  });

  it('lanza el diálogo nativo de instalación y cierra el aviso', async () => {
    const event = dispatchInstallEvent();
    signIn();
    vi.advanceTimersByTime(PROMPT_DELAY_MS);

    await pwa.installApp();

    expect(event.prompt).toHaveBeenCalled();
    expect(pwa.showInstallPrompt()).toBe(false);
  });

  it('no ofrece instalar si la app ya está instalada', () => {
    // `display-mode: standalone` simula la app ya instalada.
    const original = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('standalone'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;

    try {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
      });
      const installed = TestBed.inject(PwaService);

      dispatchInstallEvent();
      installed.onUserLoggedIn();
      vi.advanceTimersByTime(PROMPT_DELAY_MS);

      expect(installed.showInstallPrompt()).toBe(false);
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('PwaService (banner de instalación)', () => {
  let pwa: PwaService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });

    pwa = TestBed.inject(PwaService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    httpMock.verify();
    localStorage.clear();
  });

  function dispatchInstallEvent(): void {
    const event = new Event('beforeinstallprompt') as InstallEvent;
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome: 'accepted' as const });
    window.dispatchEvent(event);
  }

  function signIn(): void {
    void TestBed.inject(AuthService).ensureSession();
    // El controlador se recupera siempre del TestBed actual: tras un
    // `resetTestingModule` (que simula una recarga) el anterior ya no vale.
    httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne((req) => req.url.includes('/api/auth/me'))
      .flush({
        success: true,
        user: {
          id: 7,
          username: 'jesus',
          email: null,
          role: 'user',
          slug: 'jesus',
          paidAt: '2026-01-01T00:00:00.000Z',
        },
      });
    TestBed.tick();
  }

  it('el banner aparece cuando el modal se cierra', () => {
    dispatchInstallEvent();
    signIn();

    // Mientras el modal espera y mientras está visible, el banner se aparta.
    expect(pwa.showInstallBanner()).toBe(false);
    vi.advanceTimersByTime(PROMPT_DELAY_MS);
    expect(pwa.showInstallPrompt()).toBe(true);
    expect(pwa.showInstallBanner()).toBe(false);

    // Al cerrar el modal, entra el banner.
    pwa.dismissInstallPrompt();
    expect(pwa.showInstallBanner()).toBe(true);
  });

  it('el banner no aparece sin sesión', () => {
    dispatchInstallEvent();

    expect(pwa.showInstallBanner()).toBe(false);
  });

  it('cerrar el banner lo oculta solo durante esta sesión', () => {
    dispatchInstallEvent();
    signIn();
    vi.advanceTimersByTime(PROMPT_DELAY_MS);
    pwa.dismissInstallPrompt();

    expect(pwa.showInstallBanner()).toBe(true);

    pwa.dismissInstallBanner();
    expect(pwa.showInstallBanner()).toBe(false);

    // No se guarda nada: al recargar la página (servicio nuevo) vuelve.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const afterReload = TestBed.inject(PwaService);

    dispatchInstallEvent();
    signIn();
    vi.advanceTimersByTime(PROMPT_DELAY_MS);
    afterReload.dismissInstallPrompt();

    expect(afterReload.showInstallBanner()).toBe(true);
  });

  it('el banner sigue visible aunque el modal esté en periodo de espera de 24 horas', () => {
    dispatchInstallEvent();
    signIn();
    vi.advanceTimersByTime(PROMPT_DELAY_MS);
    pwa.dismissInstallPrompt();

    // El modal ya no volverá en 24 horas, pero el banner sí que sigue ahí.
    expect(pwa.showInstallPrompt()).toBe(false);
    expect(pwa.showInstallBanner()).toBe(true);
  });
});
