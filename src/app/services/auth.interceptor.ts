import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from './auth.service';
import { isFirstPartyApiUrl } from './auth-security';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const platformId = inject(PLATFORM_ID);

  const isBrowser = isPlatformBrowser(platformId);

  // Solo la API propia puede recibir credenciales.
  if (!isFirstPartyApiUrl(req.url)) {
    return next(req);
  }

  // La sesión viaja en una cookie `httpOnly` del backend: no hay ningún token
  // que añadir a la cabecera. Lo único que hace falta es permitir que el
  // navegador envíe la cookie (y solo a la API de casa).
  const request = isBrowser ? req.clone({ withCredentials: true }) : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      // Solo deslogueamos si:
      // - Estamos en el navegador,
      // - Teníamos sesión,
      // - El backend dice explícitamente que la sesión no es válida.
      if (!isBrowser) {
        return throwError(() => error);
      }
      const isLoginEndpoint = req.url.includes('/api/auth/login');
      const isRegisterEndpoint = req.url.includes('/api/auth/register');
      const isLogoutEndpoint = req.url.includes('/api/auth/logout');
      const message = (error.error && (error.error.message || error.error.error)) || '';
      const sessionError =
        error.status === 401 &&
        authService.isAuthenticated() &&
        !isLoginEndpoint &&
        !isRegisterEndpoint &&
        !isLogoutEndpoint &&
        (message.toLowerCase().includes('token') ||
          message.toLowerCase().includes('expired') ||
          message.toLowerCase().includes('invalid') ||
          message.toLowerCase().includes('authorization') ||
          message.toLowerCase().includes('authentication'));

      if (sessionError) {
        console.warn('Session invalid or expired. Logging out...');
        authService.logout();
      }
      return throwError(() => error);
    }),
  );
};
