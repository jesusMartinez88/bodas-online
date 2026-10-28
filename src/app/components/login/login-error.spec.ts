import { HttpErrorResponse } from '@angular/common/http';
import { describeLoginError } from './login-error';

describe('mensajes de error del inicio de sesión', () => {
  it('solo culpa a la contraseña cuando el backend dice 401', () => {
    expect(describeLoginError(new HttpErrorResponse({ status: 401 }))).toContain(
      'Credenciales incorrectas',
    );
  });

  it('avisa cuando se han agotado los intentos', () => {
    const message = describeLoginError(new HttpErrorResponse({ status: 429 }));
    expect(message).toContain('Demasiados intentos');
    expect(message).not.toContain('Credenciales incorrectas');
  });

  it('distingue un fallo de red de un fallo del servidor', () => {
    expect(describeLoginError(new HttpErrorResponse({ status: 0 }))).toContain('conectar');
    expect(describeLoginError(new HttpErrorResponse({ status: 500 }))).toContain(
      'El servidor ha tenido un problema',
    );
  });

  it('cae en credenciales incorrectas si el error no tiene status', () => {
    expect(describeLoginError(undefined)).toContain('Credenciales incorrectas');
  });
});
