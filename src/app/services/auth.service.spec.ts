import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
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
        provideRouter([]),
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
});
