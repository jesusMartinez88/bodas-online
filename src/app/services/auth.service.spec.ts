import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

/**
 * La sesión vive en una cookie `httpOnly` del backend. Estos tests comprueban
 * lo que el frontend **no** hace: guardar el token en `localStorage`.
 */
describe('AuthService (sesión por cookie httpOnly)', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // El interceptor es quien añade `withCredentials` (y quien ya no
        // manda ningún token en la cabecera).
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: 'login', children: [] }]),
      ],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('no guarda nada en localStorage al iniciar sesión', () => {
    service
      .login({ username: 'usuario', password: 'contrasena' })
      .subscribe({ error: () => undefined });

    const request = httpMock.expectOne((req) =>
      req.url.includes('/api/auth/login'),
    );
    expect(request.request.withCredentials).toBe(true);

    request.flush({
      success: true,
      user: {
        id: 7,
        username: 'usuario',
        email: 'u@example.com',
        role: 'user',
        slug: 'usuario',
        paidAt: null,
      },
    });

    expect(localStorage.length).toBe(0);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('mantiene el estado del usuario tras iniciar sesión', () => {
    service
      .login({ username: 'usuario', password: 'contrasena' })
      .subscribe({ error: () => undefined });

    httpMock
      .expectOne((req) => req.url.includes('/api/auth/login'))
      .flush({
        success: true,
        user: {
          id: 7,
          username: 'usuario',
          email: 'u@example.com',
          role: 'admin',
          slug: 'usuario',
          paidAt: null,
        },
      });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.role).toBe('admin');
    expect(localStorage.length).toBe(0);
  });

  it('rehidrata la sesión desde el backend, no desde localStorage', async () => {
    const pending = service.ensureSession();

    const request = httpMock.expectOne((req) => req.url.includes('/api/auth/me'));
    expect(request.request.withCredentials).toBe(true);
    request.flush({
      success: true,
      user: {
        id: 9,
        username: 'vuelve',
        email: 'v@example.com',
        role: 'user',
        slug: 'vuelve',
        paidAt: '2026-01-01T00:00:00.000Z',
      },
    });

    await pending;

    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.username).toBe('vuelve');
    expect(localStorage.length).toBe(0);
  });

  it('deja al usuario sin sesión si el backend responde 401', async () => {
    const pending = service.ensureSession();

    httpMock
      .expectOne((req) => req.url.includes('/api/auth/me'))
      .flush(
        { success: false, message: 'Authentication required' },
        { status: 401, statusText: 'Unauthorized' },
      );

    await pending;

    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('un 401 no se reporta como error de conexión', async () => {
    const pending = service.ensureSession();

    httpMock
      .expectOne((req) => req.url.includes('/api/auth/me'))
      .flush(
        { success: false, message: 'Authentication required' },
        { status: 401, statusText: 'Unauthorized' },
      );

    await pending;

    expect(service.sessionError()).toBeNull();
  });

  it('un fallo de red no se confunde con "sesión cerrada"', async () => {
    const pending = service.ensureSession();

    httpMock
      .expectOne((req) => req.url.includes('/api/auth/me'))
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    await pending;

    // El backend no respondió: no sabemos si hay sesión. Antes esto se
    // traducía en un redirección a /login como si la sesión hubiera caducado.
    expect(service.isAuthenticated()).toBe(false);
    expect(service.sessionError()).not.toBeNull();
  });

  it('no cierra la sesión por un 401 si el backend confirma que sigue viva', async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    service
      .login({ username: 'usuario', password: 'contrasena' })
      .subscribe({ error: () => undefined });
    httpMock.expectOne((req) => req.url.includes('/api/auth/login')).flush({
      success: true,
      user: {
        id: 7,
        username: 'usuario',
        email: 'u@example.com',
        role: 'user',
        slug: 'usuario',
        paidAt: null,
      },
    });

    // Una petición cualquiera vuelve con 401.
    TestBed.inject(HttpClient)
      .get('/api/auth/ejemplo')
      .subscribe({ error: () => undefined });
    httpMock
      .expectOne((req) => req.url.includes('/api/auth/ejemplo'))
      .flush(
        { success: false, message: 'Authentication required' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await tick();

    // El interceptor revalida antes de cerrar la sesión...
    const revalidation = httpMock.expectOne((req) => req.url.includes('/api/auth/me'));
    revalidation.flush({
      success: true,
      user: {
        id: 7,
        username: 'usuario',
        email: 'u@example.com',
        role: 'user',
        slug: 'usuario',
        paidAt: null,
      },
    });
    await tick();

    // ...y como el backend confirma que la sesión sigue viva, no se cierra.
    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.username).toBe('usuario');
  });

  it('cierra la sesión si la revalidación también dice que no hay sesión', async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

    service
      .login({ username: 'usuario', password: 'contrasena' })
      .subscribe({ error: () => undefined });
    httpMock.expectOne((req) => req.url.includes('/api/auth/login')).flush({
      success: true,
      user: {
        id: 7,
        username: 'usuario',
        email: 'u@example.com',
        role: 'user',
        slug: 'usuario',
        paidAt: null,
      },
    });

    TestBed.inject(HttpClient)
      .get('/api/auth/ejemplo')
      .subscribe({ error: () => undefined });
    httpMock
      .expectOne((req) => req.url.includes('/api/auth/ejemplo'))
      .flush(
        { success: false, message: 'Authentication required' },
        { status: 401, statusText: 'Unauthorized' },
      );
    await tick();

    const revalidation = httpMock.expectOne((req) => req.url.includes('/api/auth/me'));
    revalidation.flush(
      { success: false, message: 'Authentication required' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await tick();

    // La sesión estaba muerta: se cierra y se avisa al backend (una sola vez).
    const logout = httpMock.expectOne((req) => req.url.includes('/api/auth/logout'));
    logout.flush({ success: true });
    await tick();

    expect(service.isAuthenticated()).toBe(false);
    // Y no se encadena un segundo cierre de sesión.
    expect(httpMock.match((req) => req.url.includes('/api/auth/logout')).length).toBe(0);
  });

  it('no pierde la sesión recién iniciada por una respuesta vieja de /api/auth/me', async () => {
    // 1) Consulta de sesión en vuelo: la de rehidratación al arrancar la
    //    página. Si el backend está dormido y tarda en despertar, esta
    //    petición sigue abierta cuando el usuario ya ha escrito sus
    //    credenciales.
    const pending = service.ensureSession();
    const meRequest = httpMock.expectOne((req) => req.url.includes('/api/auth/me'));

    // 2) El usuario inicia sesión mientras esa petición sigue en vuelo.
    service
      .login({ username: 'usuario', password: 'contrasena' })
      .subscribe({ error: () => undefined });
    httpMock
      .expectOne((req) => req.url.includes('/api/auth/login'))
      .flush({
        success: true,
        user: {
          id: 7,
          username: 'usuario',
          email: 'u@example.com',
          role: 'user',
          slug: 'usuario',
          paidAt: null,
        },
      });

    expect(service.isAuthenticated()).toBe(true);

    // 3) Llega la respuesta vieja: 401, porque se pidió antes de que existiera
    //    la cookie. Describe el estado anterior, no el actual.
    meRequest.flush(
      { success: false, message: 'Authentication required' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await pending;

    // Si el bug está, el interceptor ve el 401, cree que la sesión caducó y
    // cierra sesión. La drenamos para que `verify()` no se queje.
    for (const request of httpMock.match(() => true)) {
      request.flush({ success: true });
    }

    // La sesión que se acaba de iniciar no puede caer por una respuesta vieja.
    expect(service.isAuthenticated()).toBe(true);
    expect(service.currentUser()?.username).toBe('usuario');
  });

  it('reintenta la consulta de sesión tras un fallo de conexión', async () => {
    const pending = service.ensureSession();
    httpMock
      .expectOne((req) => req.url.includes('/api/auth/me'))
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await pending;

    expect(service.sessionError()).not.toBeNull();

    const retry = service.retrySession();
    httpMock
      .expectOne((req) => req.url.includes('/api/auth/me'))
      .flush({
        success: true,
        user: {
          id: 9,
          username: 'vuelve',
          email: 'v@example.com',
          role: 'user',
          slug: 'vuelve',
          paidAt: null,
        },
      });
    await retry;

    expect(service.isAuthenticated()).toBe(true);
    expect(service.sessionError()).toBeNull();
  });
});
