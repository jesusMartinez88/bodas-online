import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  PLATFORM_ID,
  HostListener,
  ElementRef,
  viewChild,
  effect,
  OnInit,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminService, VisitStats } from '../../services/admin.service';
import {
  AdminUser,
  AdminUserPatch,
  LandingQuestionnaire,
} from '../../../types/api';
import { ExitConfirmService } from '../../services/exit-confirm.service';
import { ExitConfirmModalComponent } from '../../shared/components/exit-confirm-modal/exit-confirm-modal.component';
import { VersionService } from '../../services/version.service';

interface EditFormState {
  email: string;
  paid: boolean;
  invitationCompleted: boolean;
  notes: string;
}

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, FormsModule, ExitConfirmModalComponent],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersComponent implements OnInit {
  private adminService = inject(AdminService);
  private platformId = inject(PLATFORM_ID);
  protected exitConfirmService = inject(ExitConfirmService);
  private versionService = inject(VersionService);

  // DOM refs para el focus trap del modal
  private firstFieldRef = viewChild<ElementRef<HTMLElement>>('firstField');
  private dialogRef = viewChild<ElementRef<HTMLElement>>('editDialog');

  users = signal<AdminUser[]>([]);
  isLoading = signal<boolean>(true);
  loadError = signal<string | null>(null);
  actionError = signal<string | null>(null);
  searchQuery = signal<string>('');

  editingUser = signal<AdminUser | null>(null);
  editForm = signal<EditFormState>({
    email: '',
    paid: false,
    invitationCompleted: false,
    notes: '',
  });
  isSaving = signal<boolean>(false);

  confirmingDelete = signal<AdminUser | null>(null);
  isDeleting = signal<boolean>(false);

  // Cuestionario inicial de la landing del cliente. Se muestra en un
  // modal aparte para que el admin pueda usarlo como brief de diseño.
  viewingQuestionnaire = signal<AdminUser | null>(null);
  questionnaire = signal<LandingQuestionnaire | null>(null);
  questionnaireLoading = signal<boolean>(false);
  questionnaireError = signal<string | null>(null);

  protected readonly appVersion = this.versionService.getFullVersion();

  filteredUsers = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const list = this.users();
    if (!query) return list;
    return list.filter((u) => {
      return (
        u.username.toLowerCase().includes(query) ||
        (u.email ?? '').toLowerCase().includes(query) ||
        u.slug.toLowerCase().includes(query) ||
        (u.notes ?? '').toLowerCase().includes(query)
      );
    });
  });

  totalCount = computed(() => this.users().length);
  paidCount = computed(() => this.users().filter((u) => u.paid).length);
  invitationCount = computed(
    () => this.users().filter((u) => u.hasInvitation).length,
  );
  noInvitationCount = computed(
    () => this.users().filter((u) => !u.hasInvitation).length,
  );

  // Visitas globales — cargadas desde el endpoint admin independiente.
  visitStats = signal<VisitStats | null>(null);

  constructor() {
    // Foco inicial al abrir el modal (solo navegador; en SSR no hay DOM).
    effect(() => {
      if (this.editingUser() && isPlatformBrowser(this.platformId)) {
        // Esperar al siguiente tick para que el modal ya esté pintado.
        queueMicrotask(() => {
          this.firstFieldRef()?.nativeElement?.focus();
        });
      }
    });
  }

  ngOnInit() {
    this.loadUsers();
    this.loadVisitStats();
  }

  loadVisitStats() {
    this.adminService
      .getVisitStats()
      .then((stats) => this.visitStats.set(stats))
      .catch(() => { /* no-op: el stat pill simplemente no aparece */ });
  }

  loadUsers() {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.adminService
      .listUsers()
      .then((users) => {
        this.users.set(users);
        this.isLoading.set(false);
      })
      .catch((err: HttpErrorResponse) => {
        console.error('[admin] list users error:', err);
        this.loadError.set(
          this.extractMessage(err, 'No se pudieron cargar los usuarios.'),
        );
        this.isLoading.set(false);
      });
  }

  onSearchChange(value: string) {
    this.searchQuery.set(value);
  }

  openEditDialog(user: AdminUser) {
    if (user.isProtected) return;
    this.actionError.set(null);
    this.editingUser.set(user);
    this.editForm.set({
      email: user.email ?? '',
      paid: user.paid,
      invitationCompleted: !!user.invitationCompletedAt,
      notes: user.notes ?? '',
    });
  }

  closeEditDialog() {
    if (this.isSaving()) return;
    this.editingUser.set(null);
    this.actionError.set(null);
  }

  updateEditField<K extends keyof EditFormState>(
    key: K,
    value: EditFormState[K],
  ) {
    this.editForm.update((current) => ({ ...current, [key]: value }));
  }

  saveEdit() {
    const user = this.editingUser();
    if (!user) return;

    const form = this.editForm();
    const patch: AdminUserPatch = {
      email: form.email.trim() ? form.email.trim() : null,
      paidAt: form.paid ? new Date().toISOString() : null,
      invitationCompletedAt: form.invitationCompleted
        ? new Date().toISOString()
        : null,
      notes: form.notes.trim() ? form.notes.trim() : null,
    };

    this.isSaving.set(true);
    this.actionError.set(null);
    this.adminService
      .updateUser(user.id, patch)
      .then((updated) => {
        this.users.update((list) =>
          list.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)),
        );
        this.isSaving.set(false);
        this.editingUser.set(null);
      })
      .catch((err: HttpErrorResponse) => {
        console.error('[admin] update user error:', err);
        this.actionError.set(this.extractMessage(err, 'No se pudo guardar.'));
        this.isSaving.set(false);
      });
  }

  openDeleteConfirm(user: AdminUser) {
    if (user.isProtected) return;
    this.actionError.set(null);
    this.confirmingDelete.set(user);
  }

  closeDeleteConfirm() {
    if (this.isDeleting()) return;
    this.confirmingDelete.set(null);
  }

  /**
   * Abre el modal con el cuestionario inicial de la landing de un usuario.
   * El admin lo usa como brief para diseñar la página antes de empezar.
   * El admin principal (`username === 'admin'`) está protegido en backend
   * y nunca debería llegar aquí; mantenemos la guarda por si acaso.
   */
  openQuestionnaire(user: AdminUser) {
    if (user.isProtected) return;
    this.actionError.set(null);
    this.questionnaireError.set(null);
    this.questionnaire.set(null);
    this.viewingQuestionnaire.set(user);
    this.questionnaireLoading.set(true);

    this.adminService
      .getLandingQuestionnaire(user.id)
      .then((data) => {
        this.questionnaire.set(data);
        this.questionnaireLoading.set(false);
      })
      .catch((err: HttpErrorResponse) => {
        console.error('[admin] questionnaire error:', err);
        this.questionnaireError.set(
          this.extractMessage(
            err,
            'No se pudo cargar el cuestionario del usuario.',
          ),
        );
        this.questionnaireLoading.set(false);
      });
  }

  closeQuestionnaire() {
    if (this.questionnaireLoading()) return;
    this.viewingQuestionnaire.set(null);
    this.questionnaire.set(null);
    this.questionnaireError.set(null);
  }

  confirmDelete() {
    const user = this.confirmingDelete();
    if (!user) return;

    this.isDeleting.set(true);
    this.actionError.set(null);
    this.adminService
      .deleteUser(user.id)
      .then(() => {
        this.users.update((list) => list.filter((u) => u.id !== user.id));
        this.isDeleting.set(false);
        this.confirmingDelete.set(null);
      })
      .catch((err: HttpErrorResponse) => {
        console.error('[admin] delete user error:', err);
        this.actionError.set(
          this.extractMessage(err, 'No se pudo eliminar el usuario.'),
        );
        this.isDeleting.set(false);
      });
  }

  /**
   * Trampa de foco simple: si el modal está abierto y Tab mueve el foco fuera,
   * lo devolvemos al primer campo. También cerramos con Escape.
   */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (!isPlatformBrowser(this.platformId)) return;
    if (event.key === 'Escape') {
      if (this.editingUser()) {
        this.closeEditDialog();
      } else if (this.confirmingDelete()) {
        this.closeDeleteConfirm();
      }
      return;
    }
    if (event.key !== 'Tab' || !this.editingUser()) return;

    const dialog = this.dialogRef()?.nativeElement;
    if (!dialog) return;

    const focusables = dialog.querySelectorAll<HTMLElement>(
      'input, select, button, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * Abre la invitación pública del usuario en una pestaña nueva.
   * El slug se toma del array `data[]` que devuelve el endpoint de admin,
   * y la ruta `:tenant` de Angular lo recoge en `paramMap` para que el
   * `RsvpFormComponent` pueda registrar invitados vía `/public/:slug`.
   */
  openInvitation(user: AdminUser) {
    if (!this.canOpenInvitation(user)) return;
    if (!isPlatformBrowser(this.platformId)) return;
    window.open(`/${user.slug}`, '_blank', 'noopener,noreferrer');
  }

  /**
   * Abre el modal de confirmación de salida (mismo patrón que el dashboard).
   * El `ExitConfirmModalComponent` se encarga de llamar a `AuthService.logout()`
   * si el usuario confirma.
   */
  logout() {
    this.exitConfirmService.openExitConfirm();
  }

  canOpenInvitation(user: AdminUser): boolean {
    return user.hasInvitation;
  }

  invitationButtonTitle(user: AdminUser): string {
    if (!user.hasInvitation) {
      return 'Este usuario aún no tiene invitación';
    }
    return 'Abrir invitación del usuario';
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  }

  /**
   * Formatea una fecha "YYYY-MM-DD" (o ISO) como dd/mm/yyyy sin hora.
   * El input `date` del cuestionario suele ser solo fecha.
   */
  formatShortDate(value: string | null | undefined): string {
    if (!value) return '—';
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  }

  /** 0/1 → Sí/No para los booleanos del cuestionario. */
  formatYesNo(value: 0 | 1 | boolean | null | undefined): string {
    if (value === 1 || value === true) return 'Sí';
    if (value === 0 || value === false) return 'No';
    return '—';
  }

  /**
   * Parsea la columna JSON `ourStoryEntries` y devuelve un array de
   * `{ url, caption }`. Si el valor es null/inválido o no es un array
   * de objetos con `url`, devuelve `null` para que el template no
   * muestre nada.
   */
  parseOurStoryEntries(
    value: string | null | undefined,
  ): { url: string; caption: string }[] | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return null;
      const cleaned = parsed
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const url = typeof entry.url === 'string' ? entry.url.trim() : '';
          const caption =
            typeof entry.caption === 'string' ? entry.caption.trim() : '';
          if (!url) return null;
          return { url, caption };
        })
        .filter((e): e is { url: string; caption: string } => e !== null);
      return cleaned.length > 0 ? cleaned : null;
    } catch {
      return null;
    }
  }

  /**
   * LEGACY: parsea la columna JSON `ourStoryCaptions` (formato antiguo,
   * array de strings) y devuelve los strings limpios. Si no hay datos
   * válidos, devuelve `null`.
   */
  parseLegacyOurStoryCaptions(
    value: string | null | undefined,
  ): string[] | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return null;
      const cleaned = parsed
        .map((c) => (typeof c === 'string' ? c.trim() : ''))
        .filter((c) => c.length > 0);
      return cleaned.length > 0 ? cleaned : null;
    } catch {
      return null;
    }
  }

  private extractMessage(err: HttpErrorResponse, fallback: string): string {
    const body = err.error as { message?: string; error?: string } | null;
    return body?.message || body?.error || fallback;
  }
}
