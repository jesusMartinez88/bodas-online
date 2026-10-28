import { Injectable, signal, inject, PLATFORM_ID, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { catchError, firstValueFrom, of, tap, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthRegisterRequest,
  AuthRegisterResponse,
  CheckUsernameResponse,
} from '../../types/api';

export interface CurrentUser {
  id: number;
  username: string;
  email: string | null;
  role: string;
  slug: string;
  /**
   * Fecha ISO en la que el webhook de Stripe confirmó el pago, o
   * `null` si el usuario aún no ha pagado. La fuente de verdad es
   * el backend (columna `users.paidAt`); en el frontend se mantiene
   * sincronizada de forma optimista tras un pago exitoso.
   */
  paidAt: string | null;
}

/**
 * Normaliza la respuesta del backend al tipo `CurrentUser` de la app.
 */
const toCurrentUser = (
  user: Partial<CurrentUser> | null | undefined,
): CurrentUser | null => {
  if (!user || !Number.isFinite(Number(user.id))) return null;
  return {
    id: Number(user.id),
    username: user.username ?? '',
    email: user.email ?? null,
    role: user.role ?? 'user',
    slug: user.slug ?? '',
    paidAt: user.paidAt ?? null,
  };
};

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private baseUrl = environment.apiBaseUrl;
  private platformId = inject(PLATFORM_ID);

  /**
   * La sesión vive en una cookie `httpOnly` del backend: el JavaScript de la
   * página **no** puede leerla. Por eso aquí no hay ningún token en memoria ni
   * en `localStorage`: solo el estado del usuario, que se pide al backend.
   */
  private currentUserSignal = signal<CurrentUser | null>(null);

  /** ¿Ya se ha consultado al backend si hay sesión abierta? */
  private sessionResolved = signal(false);

  /**
   * Motivo por el que **no** se pudo consultar la sesión al backend.
   *
   * `null` = el backend respondió: o hay sesión o no la hay, pero lo sabemos.
   * Un texto = el backend no pudo responder (dormido en Render, 5xx, sin red):
   * **no sabemos** si hay sesión, y eso no es lo mismo que "sin sesión".
   *
   * Sin esta distinción, un backend dormido echaba al usuario a `/login` como
   * si su sesión hubiera caducado, cuando el problema era de conexión.
   */
  readonly sessionError = signal<string | null>(null);

  /** Promesa en curso de rehidratación, para no duplicar la llamada. */
  private sessionPromise: Promise<void> | null = null;

  isAuthenticated = computed(() => !!this.currentUserSignal());
  currentUser = this.currentUserSignal.asReadonly();
  isAdmin = computed(() => this.currentUserSignal()?.role === 'admin');

  login(credentials: AuthLoginRequest) {
    return this.http
      .post<AuthLoginResponse>(`${this.baseUrl}/api/auth/login`, credentials)
      .pipe(
        tap((response) => {
          // La cookie de sesión ya la ha puesto el backend. Aquí solo se
          // refleja el usuario en el estado de la app.
          this.currentUserSignal.set(toCurrentUser(response?.user));
          this.sessionResolved.set(true);
        }),
        catchError((err) => {
          console.error('[auth] login error:', err);
          throw err;
        }),
      );
  }

  register(payload: AuthRegisterRequest) {
    return this.http
      .post<AuthRegisterResponse>(`${this.baseUrl}/api/auth/register`, payload)
      .pipe(
        tap((response) => {
          this.currentUserSignal.set(toCurrentUser(response?.user));
          this.sessionResolved.set(true);
        }),
        catchError((err) => {
          console.error('[auth] register error:', err);
          throw err;
        }),
      );
  }

  /**
   * Consulta al backend si hay una sesión abierta (la cookie `httpOnly`).
   *
   * Es lo que sustituye a la rehidratación desde `localStorage`: al recargar
   * la página el navegador manda la cookie solo, así que el frontend tiene que
   * preguntar a `/api/auth/me` para saber con quién está.
   *
   * En SSR no hay cookie: se resuelve como "sin sesión" sin llamar al
   * backend.
   */
  ensureSession(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      this.sessionResolved.set(true);
      return Promise.resolve();
    }
    if (this.sessionPromise) return this.sessionPromise;

    this.sessionPromise = firstValueFrom(
      this.http
        .get<{ success: boolean; user?: CurrentUser }>(`${this.baseUrl}/api/auth/me`)
        .pipe(
          tap((response) => {
            this.currentUserSignal.set(toCurrentUser(response?.user));
            this.sessionResolved.set(true);
            this.sessionError.set(null);
          }),
          catchError((error: HttpErrorResponse) => {
            if (error.status === 401) {
              // 401 = no hay cookie válida: es el estado normal de un visitante
              // que no ha iniciado sesión, no un error.
              this.currentUserSignal.set(null);
              this.sessionError.set(null);
            } else {
              // El backend no ha podido responder (dormido, 5xx, sin red): no
              // sabemos si hay sesión. Se distingue de un 401 para no tratar un
              // fallo de red como "sesión caducada".
              this.currentUserSignal.set(null);
              this.sessionError.set(
                'No hemos podido conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
              );
            }
            this.sessionResolved.set(true);
            return of(null);
          }),
        ),
    )
      .then(() => undefined)
      .finally(() => {
        this.sessionPromise = null;
      });

    return this.sessionPromise;
  }

  /**
   * Reintenta la consulta de sesión tras un fallo de conexión.
   *
   * `ensureSession()` libera su promesa cuando la petición termina (incluido
   * el error), así que volver a llamarla hace una petición nueva de verdad.
   * Si el backend vuelve a responder, `sessionError` se limpia sola.
   */
  async retrySession(): Promise<void> {
    this.sessionError.set(null);
    await this.ensureSession();
  }

  /**
   * Comprueba si un username está disponible para registro.
   * El backend devuelve una respuesta genérica `{ success, available }`
   * (no distingue taken / reserved / invalid_format) para evitar
   * user enumeration. Si la petición falla de red, devolvemos
   * `available: false` para que la UI no asuma disponibilidad por error.
   */
  checkUsername(username: string) {
    const trimmed = username.trim();
    return this.http
      .get<CheckUsernameResponse>(`${this.baseUrl}/api/auth/check-username`, {
        params: { username: trimmed },
      })
      .pipe(
        catchError((err) => {
          console.error('[auth] checkUsername error:', err);
          const fallback: CheckUsernameResponse = {
            success: false,
            available: false,
          };
          return of(fallback);
        }),
      );
  }

  /**
   * Solicita un código de 6 dígitos enviado al email registrado del usuario
   * para restablecer la contraseña desde la configuración.
   */
  requestPasswordResetCode(): Observable<{ success: boolean; message: string; code?: string }> {
    return this.http.post<{ success: boolean; message: string; code?: string }>(
      `${this.baseUrl}/api/auth/me/request-reset-code`,
      {},
    );
  }

  /**
   * Cambia la contraseña del usuario autenticado.
   * El backend exige la contraseña actual antes de aplicar el cambio,
   * igual que en `updateMyEmail` (defensa anti-JWT-robado).
   *
   * Devuelve `{ success, message }` en ambos casos (éxito o 401).
   * Si la contraseña actual no coincide, el backend responde 401 y
   * Angular propaga un `HttpErrorResponse` con `error.message`.
   */
  changeMyPassword(payload: {
    currentPassword: string;
    newPassword: string;
  }): Observable<{ success: boolean; message: string }> {
    return this.http.patch<{ success: boolean; message: string }>(
      `${this.baseUrl}/api/auth/me/password`,
      payload,
    );
  }

  /**
   * Actualiza el email del usuario autenticado.
   * Requiere la contraseña actual como medida anti-JWT-robado
   * (el backend la valida antes de aplicar el cambio).
   *
   * El email puede ser `''` para borrarlo; el backend lo convierte a `null`.
   */
  updateMyEmail(payload: {
    email: string;
    currentPassword: string;
  }): Observable<{
    success: boolean;
    message: string;
    data?: {
      id: number;
      username: string;
      email: string | null;
      role: string;
      slug: string;
    };
  }> {
    return this.http.patch<{
      success: boolean;
      message: string;
      data?: {
        id: number;
        username: string;
        email: string | null;
        role: string;
        slug: string;
      };
    }>(`${this.baseUrl}/api/auth/me`, payload);
  }

  /**
   * Recupera los datos frescos del usuario autenticado (incluye email).
   * Útil cuando el JWT no lleva un campo actualizado.
   */
  fetchMyProfile(): Observable<{
    success: boolean;
    user?: {
      id: number;
      username: string;
      email: string | null;
      role: string;
      slug: string;
    };
    message?: string;
  }> {
    return this.http.get<{
      success: boolean;
      user?: {
        id: number;
        username: string;
        email: string | null;
        role: string;
        slug: string;
      };
      message?: string;
    }>(`${this.baseUrl}/api/auth/me`);
  }

  /**
   * Valida el código de verificación recibido y establece la nueva contraseña.
   */
  resetPasswordWithCode(
    code: string,
    newPassword: string,
  ): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.baseUrl}/api/auth/me/reset-password-with-code`,
      { code, newPassword },
    );
  }

  /**
   * Cierra la sesión.
   *
   * Se avisa al backend para que borre la cookie `httpOnly` (si no, el
   * navegador la seguiría mandando). Es best-effort: aunque la llamada falle,
   * la sesión local se limpia igualmente.
   */
  logout() {
    this.currentUserSignal.set(null);
    this.sessionResolved.set(true);

    if (isPlatformBrowser(this.platformId)) {
      this.http
        .post<{ success: boolean }>(`${this.baseUrl}/api/auth/logout`, {})
        .pipe(catchError(() => of({ success: false })))
        .subscribe(() => undefined);
    }

    this.router.navigate(['/login']);
  }

  /**
   * Refresca los datos del usuario desde el backend (email, `paidAt`, rol).
   * Es la fuente de verdad: la cookie solo lleva el JWT.
   */
  refreshCurrentUser() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.http
      .get<{ success: boolean; user?: CurrentUser }>(`${this.baseUrl}/api/auth/me`)
      .pipe(
        tap((response) => {
          this.currentUserSignal.set(toCurrentUser(response?.user));
        }),
        catchError(() => {
          this.currentUserSignal.set(null);
          return of(null);
        }),
      )
      .subscribe(() => undefined);
  }

  /**
   * Marca al usuario actual como pagado de forma optimista. Lo usamos
   * justo después de que `confirmPayment` devuelve `succeeded` para
   * que el `paymentGuard` deje pasar al dashboard sin esperar al
   * webhook (que es la fuente real pero puede tardar unos segundos).
   *
   * El JWT no se re-firma aquí: el payload queda con `paidAt: null`
   * hasta el próximo login. La signal `currentUserSignal` es la que
   * consulta el guard, así que el efecto es inmediato en la SPA.
   */
  markAsPaid(paidAtIso: string = new Date().toISOString()): void {
    const current = this.currentUserSignal();
    if (!current) return;
    this.currentUserSignal.set({ ...current, paidAt: paidAtIso });
  }
}
