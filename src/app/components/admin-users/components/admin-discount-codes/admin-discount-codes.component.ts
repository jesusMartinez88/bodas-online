import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { DiscountCodesService } from '../../../../services/discount-codes.service';
import { DiscountCode } from '../../../../../types/api';

/**
 * Estado del formulario (compartido por alta y edición).
 *
 * - `expiresAt` se mantiene como string `YYYY-MM-DDTHH:mm` mientras
 *   el usuario edita (lo que produce un `<input type="datetime-local">`)
 *   y se transforma a ISO antes de salir por HTTP.
 */
export interface DiscountFormState {
  code: string;
  percent: number;
  description: string;
  expiresAt: string;
}

/**
 * Regex que el backend aplica en `discountCode.create()` /
 * `discountCode.update()`. La replicamos aquí para no enviar al
 * servidor payloads que sabemos inválidos y mostrar el error en el
 * momento (UX) en vez de esperar la respuesta 400.
 */
const CODE_REGEX = /^[A-Z0-9_-]{2,40}$/;

/**
 * Sección "Códigos de descuento" del panel de admin.
 *
 * Capacidades:
 *  - Listar todos los códigos (activos e inactivos) con su % de descuento
 *    y caducidad opcional.
 *  - Crear un código nuevo con validación de cliente (regex + rango).
 *  - Activar / desactivar un código existente (toggle optimista).
 *  - Editar `%`, descripción y caducidad de un código.
 *  - Eliminar un código (con `window.confirm`).
 *
 * El backend ya hace auth de admin + validación de payload; aquí
 * añadimos la misma regex para fallar rápido en el formulario.
 */
@Component({
  selector: 'app-admin-discount-codes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-discount-codes.component.html',
  styleUrl: './admin-discount-codes.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDiscountCodesComponent implements OnInit {
  private discountService = inject(DiscountCodesService);
  private platformId = inject(PLATFORM_ID);

  /** Lista completa de códigos. Más recientes primero (lo garantiza el backend). */
  codes = signal<DiscountCode[]>([]);
  isLoading = signal<boolean>(true);
  loadError = signal<string | null>(null);
  actionError = signal<string | null>(null);

  /** Estado del formulario de alta. */
  isCreating = signal<boolean>(false);
  createForm = signal<DiscountFormState>(this.emptyForm());
  createValidation = signal<string | null>(null);
  createSuccess = signal<string | null>(null);

  /** Estado del modal de edición. */
  editingCode = signal<DiscountCode | null>(null);
  editForm = signal<DiscountFormState>(this.emptyForm());
  editValidation = signal<string | null>(null);
  isUpdating = signal<boolean>(false);

  /** IDs de códigos con toggle pendiente (para spinner por fila). */
  pendingToggleIds = signal<readonly number[]>([]);
  /** ID del código que se está borrando ahora mismo. */
  pendingDeleteId = signal<number | null>(null);

  /** Contadores derivados. */
  activeCount = computed(
    () => this.codes().filter((c) => this.toBool(c.active)).length,
  );
  inactiveCount = computed(() => this.codes().length - this.activeCount());

  ngOnInit(): void {
    this.loadCodes();
  }

  // ── Carga ───────────────────────────────────────────────────────────

  loadCodes(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.discountService
      .list()
      .then((codes) => {
        this.codes.set(codes);
        this.isLoading.set(false);
      })
      .catch((err: HttpErrorResponse) => {
        console.error('[admin-discounts] list error:', err);
        this.loadError.set(
          this.extractMessage(err, 'No se pudieron cargar los códigos.'),
        );
        this.isLoading.set(false);
      });
  }

  // ── Alta ────────────────────────────────────────────────────────────

  updateCreateField<K extends keyof DiscountFormState>(
    key: K,
    value: DiscountFormState[K],
  ): void {
    this.createForm.update((current) => ({ ...current, [key]: value }));
    if (this.createValidation()) this.createValidation.set(null);
    if (this.createSuccess()) this.createSuccess.set(null);
  }

  submitCreate(): void {
    if (this.isCreating()) return;
    const form = this.createForm();
    const validation = this.validateForm(form);
    if (validation) {
      this.createValidation.set(validation);
      return;
    }

    this.isCreating.set(true);
    this.actionError.set(null);
    this.discountService
      .create({
        code: form.code,
        percent: form.percent,
        description: form.description || null,
        expiresAt: this.toIsoOrNull(form.expiresAt),
      })
      .then((created) => {
        // Insertar al principio para mantener "más reciente arriba".
        this.codes.update((list) => [created, ...list]);
        this.isCreating.set(false);
        this.createForm.set(this.emptyForm());
        this.createSuccess.set(`Código ${created.code} creado.`);
      })
      .catch((err: HttpErrorResponse) => {
        console.error('[admin-discounts] create error:', err);
        this.actionError.set(
          this.extractMessage(
            err,
            'No se pudo crear el código. Revisa los datos e inténtalo de nuevo.',
          ),
        );
        this.isCreating.set(false);
      });
  }

  // ── Toggle activo/inactivo ──────────────────────────────────────────

  toggleActive(code: DiscountCode): void {
    if (this.pendingToggleIds().includes(code.id)) return;
    const next = !this.toBool(code.active);

    // Optimistic: actualizamos la fila ya para evitar el "salto" visual.
    this.codes.update((list) =>
      list.map((c) => (c.id === code.id ? { ...c, active: next ? 1 : 0 } : c)),
    );
    this.pendingToggleIds.update((ids) => [...ids, code.id]);

    this.discountService
      .update(code.id, { active: next })
      .catch((err: HttpErrorResponse) => {
        console.error('[admin-discounts] toggle active error:', err);
        // Rollback si el backend rechaza el cambio.
        this.codes.update((list) =>
          list.map((c) =>
            c.id === code.id ? { ...c, active: next ? 0 : 1 } : c,
          ),
        );
        this.actionError.set(
          this.extractMessage(
            err,
            'No se pudo cambiar el estado del código.',
          ),
        );
      })
      .finally(() => {
        this.pendingToggleIds.update((ids) =>
          ids.filter((id) => id !== code.id),
        );
      });
  }

  isToggling(codeId: number): boolean {
    return this.pendingToggleIds().includes(codeId);
  }

  // ── Edición ─────────────────────────────────────────────────────────

  openEdit(code: DiscountCode): void {
    if (this.isUpdating()) return;
    this.actionError.set(null);
    this.editValidation.set(null);
    this.editingCode.set(code);
    this.editForm.set({
      code: code.code,
      percent: code.percent,
      description: code.description ?? '',
      // datetime-local quiere `YYYY-MM-DDTHH:mm`. El backend
      // devuelve ISO con segundos y zona, así que recortamos.
      expiresAt: this.toLocalInputValue(code.expiresAt),
    });
  }

  closeEdit(): void {
    if (this.isUpdating()) return;
    this.editingCode.set(null);
    this.editForm.set(this.emptyForm());
    this.editValidation.set(null);
  }

  updateEditField<K extends keyof DiscountFormState>(
    key: K,
    value: DiscountFormState[K],
  ): void {
    this.editForm.update((current) => ({ ...current, [key]: value }));
    if (this.editValidation()) this.editValidation.set(null);
  }

  submitEdit(): void {
    const code = this.editingCode();
    if (!code || this.isUpdating()) return;
    const form = this.editForm();
    const validation = this.validateForm(form, /*isEdit*/ true);
    if (validation) {
      this.editValidation.set(validation);
      return;
    }

    this.isUpdating.set(true);
    this.actionError.set(null);
    this.discountService
      .update(code.id, {
        percent: form.percent,
        description: form.description || null,
        expiresAt: this.toIsoOrNull(form.expiresAt),
      })
      .then((updated) => {
        this.codes.update((list) =>
          list.map((c) => (c.id === updated.id ? updated : c)),
        );
        this.isUpdating.set(false);
        this.editingCode.set(null);
        this.editForm.set(this.emptyForm());
      })
      .catch((err: HttpErrorResponse) => {
        console.error('[admin-discounts] update error:', err);
        this.editValidation.set(
          this.extractMessage(
            err,
            'No se pudo guardar el código.',
          ),
        );
        this.isUpdating.set(false);
      });
  }

  // ── Borrado ─────────────────────────────────────────────────────────

  deleteCode(code: DiscountCode): void {
    if (this.pendingDeleteId() !== null) return;
    if (!isPlatformBrowser(this.platformId)) return;

    const ok = window.confirm(
      `¿Eliminar el cupón ${code.code}? Esta acción no se puede deshacer.`,
    );
    if (!ok) return;

    this.pendingDeleteId.set(code.id);
    this.actionError.set(null);
    this.discountService
      .remove(code.id)
      .then(() => {
        this.codes.update((list) => list.filter((c) => c.id !== code.id));
        this.pendingDeleteId.set(null);
      })
      .catch((err: HttpErrorResponse) => {
        console.error('[admin-discounts] delete error:', err);
        this.actionError.set(
          this.extractMessage(err, 'No se pudo eliminar el código.'),
        );
        this.pendingDeleteId.set(null);
      });
  }

  // ── Helpers de template ─────────────────────────────────────────────

  /**
   * Normaliza el flag `active` (backend lo serializa como `0 | 1` por
   * convención SQLite). Algunos serializadores JSON podrían devolver
   * `boolean`, así que aceptamos ambos.
   */
  toBool(value: unknown): boolean {
    return value === true || value === 1;
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return 'Sin caducidad';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return value;
      return d.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return value;
    }
  }

  /** ¿La fecha de expiración ya pasó? */
  isExpired(code: DiscountCode): boolean {
    if (!code.expiresAt) return false;
    const d = new Date(code.expiresAt);
    if (!Number.isFinite(d.getTime())) return false;
    return d.getTime() < Date.now();
  }

  // ── Privados ────────────────────────────────────────────────────────

  private emptyForm(): DiscountFormState {
    return { code: '', percent: 10, description: '', expiresAt: '' };
  }

  /**
   * Validación de cliente. Devuelve `null` si todo está OK o un mensaje
   * listo para enseñar al usuario. Coincide con las reglas del modelo
   * backend (`discountCode.create/update`).
   */
  private validateForm(form: DiscountFormState, isEdit = false): string | null {
    const code = form.code.trim().toUpperCase();
    if (!isEdit) {
      if (!code) return 'El código no puede estar vacío.';
      if (!CODE_REGEX.test(code)) {
        return 'Solo letras, números, guiones y subrayados (2-40 caracteres).';
      }
    }
    const pct = Number(form.percent);
    if (!Number.isFinite(pct) || !Number.isInteger(pct) || pct < 1 || pct > 100) {
      return 'El porcentaje debe ser un entero entre 1 y 100.';
    }
    if (form.expiresAt) {
      const d = new Date(form.expiresAt);
      if (!Number.isFinite(d.getTime())) {
        return 'La fecha de caducidad no es válida.';
      }
    }
    return null;
  }

  /** Convierte `YYYY-MM-DDTHH:mm` a ISO (lo que espera el backend). */
  private toIsoOrNull(local: string): string | null {
    if (!local || !local.trim()) return null;
    const d = new Date(local);
    if (!Number.isFinite(d.getTime())) return null;
    return d.toISOString();
  }

  /** Inverso: ISO → `YYYY-MM-DDTHH:mm` para repoblar un input `datetime-local`. */
  private toLocalInputValue(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    // Truco: usamos `getMinutes/F hours` locales para evitar el offset.
    const pad = (n: number): string => n.toString().padStart(2, '0');
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
  }

  private extractMessage(
    err: HttpErrorResponse,
    fallback: string,
  ): string {
    const body = err.error as { message?: string; error?: string } | null;
    return body?.message || body?.error || fallback;
  }
}