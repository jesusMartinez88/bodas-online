import { Injectable, signal, inject, PLATFORM_ID, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { catchError, of, tap, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthRegisterRequest,
  AuthRegisterResponse,
  CheckUsernameResponse,
} from '../../types/api';

const AUTH_TOKEN_KEY = 'auth_token';

export interface CurrentUser {
  id: number;
  username: string;
  email: string | null;
  role: string;
  slug: string;
}

/**
 * Decodifica el payload de un JWT SIN verificar la firma.
 * Se usa solo para extraer info de UI (role, slug). El backend
 * sigue siendo la fuente de verdad en cada request protegida.
 */
const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    );
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const userFromToken = (token: string | null): CurrentUser | null => {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const id = Number(payload['id']);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    username: String(payload['username'] ?? ''),
    email: (payload['email'] as string | null) ?? null,
    role: String(payload['role'] ?? 'user'),
    slug: String(payload['slug'] ?? ''),
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

  // En SSR no hay localStorage → el usuario se considera no autenticado.
  // En cliente se lee el token persistido.
  private tokenSignal = signal<string | null>(this.readToken());
  private currentUserSignal = signal<CurrentUser | null>(this.userFromPersistedToken());

  isAuthenticated = computed(() => !!this.tokenSignal());
  currentUser = this.currentUserSignal.asReadonly();
  isAdmin = computed(() => this.currentUserSignal()?.role === 'admin');

  login(credentials: AuthLoginRequest) {
    return this.http
      .post<AuthLoginResponse>(`${this.baseUrl}/api/auth/login`, credentials)
      .pipe(
        tap((response) => {
          if (response?.token && isPlatformBrowser(this.platformId)) {
            this.persistToken(response.token);
          }
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
          if (response?.token && isPlatformBrowser(this.platformId)) {
            this.persistToken(response.token);
          }
        }),
        catchError((err) => {
          console.error('[auth] register error:', err);
          throw err;
        }),
      );
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

  logout() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
    this.tokenSignal.set(null);
    this.currentUserSignal.set(null);
    this.router.navigate(['/login']);
  }

  /** Llamado por el interceptor o por el panel admin para refrescar el user. */
  refreshCurrentUser() {
    this.tokenSignal.set(this.readToken());
    this.currentUserSignal.set(this.userFromPersistedToken());
  }

  private readToken(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }

  private userFromPersistedToken(): CurrentUser | null {
    return userFromToken(this.readToken());
  }

  private persistToken(token: string) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    this.tokenSignal.set(token);
    this.currentUserSignal.set(userFromToken(token));
  }
}
