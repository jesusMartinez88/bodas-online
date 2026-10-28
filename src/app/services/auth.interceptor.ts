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

  // Generación de la sesión en el momento de enviar la petición. Si mientras
  // está en vuelo el usuario inicia sesión (o se registra), su respuesta ya no
  // describe el estado actual: un 401 de una petición antigua no debe cerrar
  // la sesión recién iniciada.
  const generation = authService.sessionGeneration;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      // Solo deslogueamos si:
      // - Estamos en el navegador,
      // - La petición no es de una sesión anterior (respuesta obsoleta),
      // - Teníamos sesión,
      // - El backend dice explícitamente que la sesión no es válida.
      if (!isBrowser) {
        return throwError(() => error);
      }
      const isStale = generation !== authService.sessionGeneration;
      const isLoginEndpoint = req.url.includes('/api/auth/login');
      const isRegisterEndpoint = req.url.includes('/api/auth/register');
      const isLogoutEndpoint = req.url.includes('/api/auth/logout');
      const message = (error.error && (error.error.message || error.error.error)) || '';
      const sessionError =
        error.status === 401 &&
        !isStale &&
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
        // La decisión la toma el servicio: revalida la sesión antes de cerrarla
        // (un 401 aislado no debe echar al usuario) y, si la sesión está
        // muerta de verdad, la cierra una sola vez.
        void authService.handleSessionUnauthorized();
      }
      return throwError(() => error);
    }),
  );
};
