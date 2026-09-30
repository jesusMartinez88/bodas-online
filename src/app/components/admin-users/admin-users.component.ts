import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  PLATFORM_ID,
  OnInit,
  HostListener,
  ElementRef,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AdminService, VisitStats } from '../../services/admin.service';
import { AuthService } from '../../services/auth.service';
import {
  AdminUser,
  AdminUserPatch,
  LandingQuestionnaire,
} from '../../../types/api';
import { ExitConfirmService } from '../../services/exit-confirm.service';
import { ExitConfirmModalComponent } from '../../shared/components/exit-confirm-modal/exit-confirm-modal.component';
import { VersionService } from '../../services/version.service';

// Subcomponentes modulares
import { AdminStatsComponent } from './components/admin-stats/admin-stats.component';
import {
  AdminEditModalComponent,
  EditFormState,
} from './components/admin-edit-modal/admin-edit-modal.component';
import { AdminQuestionnaireModalComponent } from './components/admin-questionnaire-modal/admin-questionnaire-modal.component';
import { AdminAccountModalComponent } from './components/admin-account-modal/admin-account-modal.component';
import { AdminDeleteModalComponent } from './components/admin-delete-modal/admin-delete-modal.component';

export type UserStatusFilter = 'all' | 'paid' | 'pending' | 'has_invitation';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ExitConfirmModalComponent,
    AdminStatsComponent,
    AdminEditModalComponent,
    AdminQuestionnaireModalComponent,
    AdminAccountModalComponent,
    AdminDeleteModalComponent,
  ],
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminUsersComponent implements OnInit {
  private adminService = inject(AdminService);
  private authService = inject(AuthService);
  private platformId = inject(PLATFORM_ID);
  private host = inject(ElementRef<HTMLElement>);
  protected exitConfirmService = inject(ExitConfirmService);
  private versionService = inject(VersionService);

  // Estado de lista de usuarios
  users = signal<AdminUser[]>([]);
  isLoading = signal<boolean>(true);
  loadError = signal<string | null>(null);
  actionError = signal<string | null>(null);

  // Filtros y búsqueda
  searchQuery = signal<string>('');
  statusFilter = signal<UserStatusFilter>('all');

  // Estado del modal de edición
  editingUser = signal<AdminUser | null>(null);
  isSaving = signal<boolean>(false);
  musicUploading = signal<boolean>(false);
  musicError = signal<string | null>(null);
  musicSuccess = signal<string | null>(null);

  // Estado del modal de eliminación
  confirmingDelete = signal<AdminUser | null>(null);
  isDeleting = signal<boolean>(false);

  // Estado del modal de cuestionario
  viewingQuestionnaire = signal<AdminUser | null>(null);
  questionnaire = signal<LandingQuestionnaire | null>(null);
  questionnaireLoading = signal<boolean>(false);
  questionnaireError = signal<string | null>(null);

  // Estado del modal "Mi cuenta"
  accountDialogOpen = signal<boolean>(false);
  accountSaving = signal<boolean>(false);
  accountError = signal<string | null>(null);
  accountCurrentEmail = signal<string | null>(null);
  emailSuccess = signal<string | null>(null);
  passwordSuccess = signal<string | null>(null);

  // Visitas globales
  visitStats = signal<VisitStats | null>(null);

  // Estado del menú de acciones desplegable por fila
  openMenuUserId = signal<number | null>(null);
  menuPosition = signal<{ top: number; left: number } | null>(null);
  menuUser = computed<AdminUser | null>(() => {
    const id = this.openMenuUserId();
    if (id === null) return null;
    return this.users().find((u) => u.id === id) ?? null;
  });

  protected readonly appVersion = this.versionService.getFullVersion();

  // Contadores reactivos
  totalCount = computed(() => this.users().length);
  paidCount = computed(() => this.users().filter((u) => u.paid).length);
  pendingCount = computed(() => this.users().filter((u) => !u.paid).length);
  invitationCount = computed(
    () => this.users().filter((u) => u.hasInvitation).length,
  );
  noInvitationCount = computed(
    () => this.users().filter((u) => !u.hasInvitation).length,
  );

  // Lista filtrada reactivamente por texto y por pestaña de estado
  filteredUsers = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const filter = this.statusFilter();
    let list = this.users();

    if (filter === 'paid') {
      list = list.filter((u) => u.paid);
    } else if (filter === 'pending') {
      list = list.filter((u) => !u.paid);
    } else if (filter === 'has_invitation') {
      list = list.filter((u) => u.hasInvitation);
    }

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

  ngOnInit() {
    this.loadUsers();
    this.loadVisitStats();
  }

  loadVisitStats() {
    this.adminService
      .getVisitStats()
      .then((stats) => this.visitStats.set(stats))
      .catch(() => {
        // no-op: el stat pill simplemente no aparece
      });
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

  setStatusFilter(filter: UserStatusFilter) {
    this.statusFilter.set(filter);
  }

  // --- Modal Edición ---
  openEditDialog(user: AdminUser) {
    if (user.isProtected) return;
    this.actionError.set(null);
    this.musicError.set(null);
    this.musicSuccess.set(null);
    this.editingUser.set(user);
  }

  closeEditDialog() {
    if (this.isSaving() || this.musicUploading()) return;
    this.editingUser.set(null);
    this.actionError.set(null);
  }

  saveEdit(form: EditFormState) {
    const user = this.editingUser();
    if (!user) return;

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

  uploadMusic(payload: { userId: number; event: Event }) {
    const input = payload.event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    input.value = '';
    this.musicError.set(null);
    this.musicSuccess.set(null);
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      this.musicError.set('La canción no puede superar los 20 MB.');
      return;
    }
    const isMp3Mime = file.type === 'audio/mpeg' || file.type === 'audio/mp3';
    const hasMp3Extension = file.name.toLowerCase().endsWith('.mp3');
    if (!isMp3Mime && !hasMp3Extension) {
      this.musicError.set('Selecciona un archivo MP3 válido.');
      return;
    }

    this.musicUploading.set(true);
    this.adminService
      .uploadUserMusic(payload.userId, file)
      .then(() => {
        this.musicSuccess.set('Canción de fondo guardada correctamente.');
      })
      .catch((err: HttpErrorResponse) => {
        console.error('[admin] music upload error:', err);
        this.musicError.set(
          this.extractMessage(err, 'No se pudo subir la canción.'),
        );
      })
      .finally(() => this.musicUploading.set(false));
  }

  // --- Modal Eliminación ---
  openDeleteConfirm(user: AdminUser) {
    if (user.isProtected) return;
    this.actionError.set(null);
    this.confirmingDelete.set(user);
  }

  closeDeleteConfirm() {
    if (this.isDeleting()) return;
    this.confirmingDelete.set(null);
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

  // --- Modal Cuestionario ---
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

  // --- Modal Mi Cuenta ---
  openAccountDialog() {
    this.accountError.set(null);
    this.emailSuccess.set(null);
    this.passwordSuccess.set(null);
    this.accountDialogOpen.set(true);
    this.authService.fetchMyProfile().subscribe({
      next: (res) => {
        if (res?.user?.email !== undefined) {
          this.accountCurrentEmail.set(res.user.email ?? null);
        }
      },
      error: () => {
        // Si falla, el email simplemente aparecerá como vacío.
      },
    });
  }

  closeAccountDialog() {
    if (this.accountSaving()) return;
    this.accountDialogOpen.set(false);
    this.accountError.set(null);
    this.emailSuccess.set(null);
    this.passwordSuccess.set(null);
  }

  changeAdminEmail(payload: { email: string; currentPassword: string }) {
    this.emailSuccess.set(null);
    this.accountError.set(null);
    this.accountSaving.set(true);

    this.authService.updateMyEmail(payload).subscribe({
      next: (res) => {
        this.accountSaving.set(false);
        this.emailSuccess.set(
          res.message || 'Email actualizado correctamente.',
        );
        this.accountCurrentEmail.set(res.data?.email ?? null);
      },
      error: (err: HttpErrorResponse) => {
        this.accountSaving.set(false);
        const body = err.error as { message?: string } | null;
        this.accountError.set(
          body?.message ||
            'No se pudo actualizar el email. Inténtalo de nuevo más tarde.',
        );
      },
    });
  }

  changeAdminPassword(payload: {
    currentPassword: string;
    newPassword: string;
  }) {
    this.passwordSuccess.set(null);
    this.accountError.set(null);
    this.accountSaving.set(true);

    this.authService.changeMyPassword(payload).subscribe({
      next: (res) => {
        this.accountSaving.set(false);
        this.passwordSuccess.set(
          res.message || 'Contraseña actualizada correctamente.',
        );
      },
      error: (err: HttpErrorResponse) => {
        this.accountSaving.set(false);
        const body = err.error as { message?: string } | null;
        this.accountError.set(
          body?.message ||
            'No se pudo actualizar la contraseña. Inténtalo de nuevo más tarde.',
        );
      },
    });
  }

  // --- Menú de acciones desplegable ---
  toggleActionsMenu(userId: number, event: MouseEvent) {
    event.stopPropagation();
    if (this.openMenuUserId() === userId) {
      this.closeActionsMenu();
      return;
    }

    const trigger = event.currentTarget as HTMLElement | null;
    this.openMenuUserId.set(userId);
    this.menuPosition.set(null);

    if (!trigger) return;

    // Mide el menú en el siguiente frame para colocar de forma fiable
    // y poder hacer flip vertical/horizontal cuando no cabe en el viewport.
    requestAnimationFrame(() => {
      if (this.openMenuUserId() !== userId) return; // se cerró antes de medir
      const menuEl = this.host.nativeElement.querySelector(
        '.actions-menu',
      ) as HTMLElement | null;
      if (!menuEl) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = menuEl.offsetWidth;
      const menuHeight = menuEl.offsetHeight;
      const margin = 8;
      const gap = 6;

      let top = rect.bottom + gap;
      // Flip vertical si no cabe debajo
      if (top + menuHeight > window.innerHeight - margin) {
        top = rect.top - menuHeight - gap;
      }
      if (top < margin) top = margin;

      // Por defecto, alineado a la derecha del trigger
      let left = rect.right - menuWidth;
      // Si se sale por la izquierda, ajustar
      if (left < margin) left = margin;
      // Si se sale por la derecha, ajustar
      if (left + menuWidth > window.innerWidth - margin) {
        left = window.innerWidth - menuWidth - margin;
      }

      this.menuPosition.set({ top, left });
    });
  }

  closeActionsMenu() {
    this.openMenuUserId.set(null);
    this.menuPosition.set(null);
  }

  isMenuOpen(userId: number): boolean {
    return this.openMenuUserId() === userId;
  }

  /** Acción del menú: ejecuta el handler original y cierra el menú */
  runMenuAction(user: AdminUser, action: 'brief' | 'view' | 'edit' | 'delete') {
    this.closeActionsMenu();
    switch (action) {
      case 'brief':
        this.openQuestionnaire(user);
        break;
      case 'view':
        this.openInvitation(user);
        break;
      case 'edit':
        this.openEditDialog(user);
        break;
      case 'delete':
        this.openDeleteConfirm(user);
        break;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.openMenuUserId() === null) return;
    const target = event.target as Node | null;
    if (target && !this.host.nativeElement.contains(target)) {
      this.closeActionsMenu();
      return;
    }
    const menuEl = this.host.nativeElement.querySelector('.actions-menu');
    const triggerEl = this.host.nativeElement.querySelector(
      '.actions-trigger',
    );
    if (
      menuEl &&
      target &&
      !menuEl.contains(target) &&
      triggerEl &&
      !triggerEl.contains(target)
    ) {
      this.closeActionsMenu();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.openMenuUserId() !== null) {
      this.closeActionsMenu();
    }
  }

  // Al hacer scroll o resize, cierra el menú flotante para que no quede
  // descolocado (las coordenadas fixed pierden su ancla visual).
  @HostListener('window:scroll')
  onWindowScroll() {
    if (this.openMenuUserId() !== null) {
      this.closeActionsMenu();
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (this.openMenuUserId() !== null) {
      this.closeActionsMenu();
    }
  }

  // --- Navegación y helpers ---
  openInvitation(user: AdminUser) {
    if (!this.canOpenInvitation(user)) return;
    if (!isPlatformBrowser(this.platformId)) return;
    window.open(`/${user.slug}`, '_blank', 'noopener,noreferrer');
  }

  canOpenInvitation(user: AdminUser): boolean {
    return user.hasInvitation;
  }

  invitationButtonTitle(user: AdminUser): string {
    if (!user.hasInvitation) {
      return 'Este usuario aún no tiene invitación';
    }
    return 'Abrir invitación pública del usuario';
  }

  logout() {
    this.exitConfirmService.openExitConfirm();
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

  getUserInitials(username: string): string {
    if (!username) return 'U';
    const parts = username.split(/[\s_-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return username.substring(0, 2).toUpperCase();
  }

  private extractMessage(err: HttpErrorResponse, fallback: string): string {
    const body = err.error as { message?: string; error?: string } | null;
    return body?.message || body?.error || fallback;
  }
}
