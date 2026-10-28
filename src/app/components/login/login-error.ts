import { HttpErrorResponse } from '@angular/common/http';

/**
 * Explica el fallo real del inicio de sesión.
 *
 * Antes todos los errores se mostraban como "credenciales incorrectas",
 * aunque el backend hubiera respondido 429 (demasiados intentos) o 500. Con
 * el mensaje equivocado, el usuario insiste con la misma contraseña, agota el
 * límite de intentos por IP y entra en un bucle en el que parece que su
 * contraseña no funciona.
 *
 * - 401 → credenciales incorrectas (lo único que depende de la contraseña).
 * - 429 → se agotaron los intentos: reintentar solo empeora la situación.
 * - 0   → no se pudo conectar con el backend.
 * - 5xx → el backend falló.
 */
export function describeLoginError(error: unknown): string {
  const status = (error as HttpErrorResponse | undefined)?.status;

  if (status === 429) {
    return 'Demasiados intentos de acceso desde esta conexión. Espera unos minutos antes de volver a intentarlo.';
  }
  if (status === 0) {
    return 'No hemos podido conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  }
  if (typeof status === 'number' && status >= 500) {
    return 'El servidor ha tenido un problema al iniciar sesión. Inténtalo de nuevo en un momento.';
  }
  return 'Credenciales incorrectas. Por favor, inténtalo de nuevo.';
}
