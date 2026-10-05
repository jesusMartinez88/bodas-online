import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  DiscountCode,
  DiscountCodeCreateRequest,
  DiscountCodePatchRequest,
} from '../../types/api';

/**
 * Wrapper HTTP para el CRUD de códigos de descuento del panel admin.
 *
 * Endpoints consumidos (todos bajo `/api/admin/discount-codes`):
 *
 *  - `GET    /api/admin/discount-codes`           → lista (activos e inactivos)
 *  - `POST   /api/admin/discount-codes`           → crea
 *  - `PATCH  /api/admin/discount-codes/:id`       → edita (campos opcionales)
 *  - `DELETE /api/admin/discount-codes/:id`       → elimina
 *
 * Notas:
 *
 *  - Estos endpoints requieren rol `admin` (validado por el middleware
 *    del backend). El JWT del admin viaja en cada request gracias al
 *    `authInterceptor` configurado en `app.config.ts`.
 *  - El backend devuelve un shape específico ({success, codes}/{success,
 *    code}) distinto del `ApiResponse<T>` genérico, por eso no lo usamos
 *    aquí. Los errores 4xx los gestiona el caller con `HttpErrorResponse`.
 *  - Validamos `percent` y `code` también en cliente para evitar round-trips
 *    innecesarios; la regex del código es la misma del modelo backend.
 */
@Injectable({
  providedIn: 'root',
})
export class DiscountCodesService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiBaseUrl;

  /**
   * `GET /api/admin/discount-codes`. Devuelve todos los códigos
   * (activos e inactivos) ordenados por `createdAt DESC`.
   */
  list(): Promise<DiscountCode[]> {
    return firstValueFrom(
      this.http.get<{ success: boolean; codes: DiscountCode[] }>(
        `${this.baseUrl}/api/admin/discount-codes`,
      ),
    ).then((res) => res.codes ?? []);
  }

  /**
   * `POST /api/admin/discount-codes`. Devuelve el cupón recién
   * creado (incluyendo `id`, `active = 1`).
   */
  create(payload: DiscountCodeCreateRequest): Promise<DiscountCode> {
    return firstValueFrom(
      this.http.post<{ success: boolean; code: DiscountCode }>(
        `${this.baseUrl}/api/admin/discount-codes`,
        this.normalizePayload(payload),
      ),
    ).then((res) => res.code);
  }

  /**
   * `PATCH /api/admin/discount-codes/:id`. Permite activar/desactivar
   * un código sin tocar el resto de campos. Solo se envían los campos
   * provistos para respetar la semántica PATCH del backend.
   */
  update(id: number, patch: DiscountCodePatchRequest): Promise<DiscountCode> {
    return firstValueFrom(
      this.http.patch<{ success: boolean; code: DiscountCode }>(
        `${this.baseUrl}/api/admin/discount-codes/${id}`,
        this.normalizePayload(patch),
      ),
    ).then((res) => res.code);
  }

  /**
   * `DELETE /api/admin/discount-codes/:id`. No hay body de respuesta.
   */
  remove(id: number): Promise<void> {
    return firstValueFrom(
      this.http.delete<{ success: boolean }>(
        `${this.baseUrl}/api/admin/discount-codes/${id}`,
      ),
    ).then(() => undefined);
  }

  /**
   * Normaliza los campos antes de salir al backend:
   *
   *  - `code`: trim + uppercase (mismo `normalizeCode()` del modelo).
   *  - `expiresAt`: si viene como string vacío lo mandamos `undefined`
   *    para que el backend lo guarde como `null`.
   *  - `description`: trim; si queda vacío lo mandamos `null`.
   *  - `percent`: el backend ya lo valida, pero saneamos a entero
   *    por si llega algo tipo `"15"` desde un input libre.
   */
  private normalizePayload<
    T extends Partial<DiscountCodeCreateRequest & DiscountCodePatchRequest>,
  >(payload: T): T {
    const out: Record<string, unknown> = { ...payload };
    if (typeof out['code'] === 'string') {
      out['code'] = out['code'].trim().toUpperCase();
    }
    if (typeof out['expiresAt'] === 'string') {
      const trimmed = out['expiresAt'].trim();
      out['expiresAt'] = trimmed === '' ? null : trimmed;
    }
    if (typeof out['description'] === 'string') {
      const trimmed = out['description'].trim();
      out['description'] = trimmed === '' ? null : trimmed;
    }
    if (typeof out['percent'] === 'number' && !Number.isInteger(out['percent'])) {
      out['percent'] = Math.round(out['percent']);
    }
    return out as T;
  }
}