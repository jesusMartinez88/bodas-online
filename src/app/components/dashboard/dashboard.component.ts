import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { StatsService, WeddingStats } from '../../services/stats.service';
import { TablesComponent } from './tables/tables.component';
import { SettingsComponent } from '../settings/settings.component';
import { FinancesComponent } from './finances/finances.component';
import { AttendanceProgressComponent } from './attendance-progress/attendance-progress.component';
import { Guest, GuestService } from '../../services/guest.service';
import { SettingsService } from '../../services/settings.service';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { TodosComponent } from './todos/todos.component';
import { VersionService } from '../../services/version.service';
import { ContactsComponent } from './contacts/contacts.component';
import { MusicComponent } from './music/music.component';
import { GuestFormModalComponent } from '../../shared/components/guest-form-modal/guest-form-modal.component';
import { GuestDeleteModalComponent } from '../../shared/components/guest-delete-modal/guest-delete-modal.component';
import { ExitConfirmService } from '../../services/exit-confirm.service';
import { ExitConfirmModalComponent } from '../../shared/components/exit-confirm-modal/exit-confirm-modal.component';
import { InstallBannerComponent } from '../../shared/components/install-banner/install-banner.component';
import { InvitationEditorComponent } from './invitation-editor/invitation-editor.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    TablesComponent,
    SettingsComponent,
    FinancesComponent,
    AttendanceProgressComponent,
    DragDropModule,
    TodosComponent,
    ContactsComponent,
    MusicComponent,
    GuestFormModalComponent,
    GuestDeleteModalComponent,
    ExitConfirmModalComponent,
    InvitationEditorComponent,
    InstallBannerComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private statsService = inject(StatsService);
  private guestService = inject(GuestService);
  private settingsService = inject(SettingsService);
  private versionService = inject(VersionService);
  private route = inject(ActivatedRoute);
  exitConfirmService = inject(ExitConfirmService);

  tenant = signal<string>('');
  stats = signal<WeddingStats | null>(null);
  allergiesCount = signal<number | null>(null);

  protected readonly appVersion = this.versionService.getFullVersion();

  // Invitados que han marcado que no asisten
  declinedGuestsList = computed(() => {
    const guests = this.guestService.guests();
    return guests.filter((g) => g.attending === 0 || g.attendance === false);
  });

  // Invitados confirmados
  confirmedGuestsList = computed(() => {
    const guests = this.guestService.guests();
    return guests.filter((g) => g.attending === 1 && g.attendance !== false);
  });

  // Invitados adultos
  adultsGuestsList = computed(() => {
    const guests = this.guestService.guests();
    return guests.filter((g) => g.attending !== 0 && g.isAdult === 1);
  });

  // Invitados niños
  childrenGuestsList = computed(() => {
    const guests = this.guestService.guests();
    return guests.filter((g) => g.attending !== 0 && g.isAdult === 0);
  });

  // Invitados sin asignar
  unassignedGuestsList = computed(() => {
    const guests = this.guestService.guests();
    return guests.filter((g) => g.attending !== 0 && (!g.tableId || g.tableId === 0));
  });

  // Invitados que necesitan transporte
  transportGuestsList = computed(() => {
    const guests = this.guestService.guests();
    return guests.filter((g) => g.attending !== 0 && g.needsTransport === true);
  });

  // Invitados con alergias
  allergiesGuestsList = computed(() => {
    const guests = this.guestService.guests();
    return guests.filter((g) => g.attending !== 0 && g.allergies && g.allergies.trim() !== '');
  });

  // Modal genérico para mostrar listas de invitados
  showGuestsModal = signal(false);
  modalTitle = signal('');
  modalGuestsList = signal<Guest[]>([]);
  modalShowActions = signal(false); // Para mostrar/ocultar botones de acción

  showDeclinedGuestsModal = signal(false);

  showEditGuestModal = signal(false);
  selectedGuestForEdit = signal<Guest | null>(null);

  showGuestDeleteConfirm = signal(false);
  guestToDelete = signal<Guest | null>(null);
  deleteGuestSource = signal<'declined' | 'modal' | null>(null);

  searchQuery = signal('');

  filteredModalGuestsList = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const list = this.modalGuestsList();
    if (!query) return list;
    return list.filter(
      (g) =>
        g.name.toLowerCase().includes(query) ||
        (g.phone && g.phone.toLowerCase().includes(query)) ||
        (g.email && g.email.toLowerCase().includes(query)),
    );
  });

  filteredDeclinedGuestsList = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const list = this.declinedGuestsList();
    if (!query) return list;
    return list.filter(
      (g) =>
        g.name.toLowerCase().includes(query) ||
        (g.phone && g.phone.toLowerCase().includes(query)) ||
        (g.email && g.email.toLowerCase().includes(query)),
    );
  });

  // Automatic count based on the shared signal in GuestService
  unassignedGuestsCount = computed(() => {
    const guests = this.guestService.guests();
    return guests.filter((g) => g.attending !== 0 && (!g.tableId || g.tableId === 0)).length;
  });

  sentGuestsCount = computed(() => {
    const guests = this.guestService.guests();
    // exclude declines
    return guests.filter((g) => g.attending !== 0 && g.tableId && g.tableId !== 0).length;
  });

  // total shown to the user (exclude declined)
  displayTotal = computed(() => {
    const s = this.stats();
    if (!s) return 0;
    const declined = s.declined || 0;
    return s.total - declined;
  });

  childrenCount = computed(() => {
    const guests = this.guestService.guests();
    return guests
      .filter((g) => g.attending !== 0) // Exclude declined guests
      .reduce((total, guest: Guest) => {
        const childrenFromRsvp = Number(guest.children) || 0;
        return total + (childrenFromRsvp > 0 ? childrenFromRsvp : guest.isAdult === 1 ? 0 : 1);
      }, 0);
  });

  adultsCount = computed(() => {
    const guests = this.guestService.guests();
    return guests
      .filter((g) => g.attending !== 0) // Exclude declined guests
      .reduce((total, guest: Guest) => {
        const adultsFromRsvp = Number(guest.adults) || 0;
        return total + (adultsFromRsvp > 0 ? adultsFromRsvp : guest.isAdult === 1 ? 1 : 0);
      }, 0);
  });

  pendings = computed(() => {
    const estimated = this.settingsService.settings().total_estimated_guests || 0;
    const confirmed = this.stats()?.confirmed || 0;
    const declined = this.stats()?.declined || 0;
    return estimated - confirmed - declined;
  });

  isLoading = signal(true);
  error = signal<string | null>(null);
  currentView = signal<
    'stats' | 'tables' | 'settings' | 'finances' | 'todos' | 'contacts' | 'music' | 'invitation'
  >('stats');
  isMenuOpen = signal(false);
  isSidebarCollapsed = signal(false);

  ngOnInit() {
    this.tenant.set(this.route.snapshot.paramMap.get('tenant') || '');
    this.loadStats();
    this.settingsService.loadSettings().subscribe();

    // Restore persisted view and menu state
    try {
      const savedView = localStorage.getItem('dashboard.currentView');
      if (
        savedView &&
        ['stats', 'tables', 'settings', 'finances', 'todos', 'contacts', 'music', 'invitation'].includes(
          savedView,
        )
      ) {
        this.currentView.set(
          savedView as
            | 'stats'
            | 'tables'
            | 'settings'
            | 'finances'
            | 'todos'
            | 'contacts'
            | 'music'
            | 'invitation',
        );
      }
    } catch {
      // ignore
    }

    try {
      const menu = localStorage.getItem('dashboard.isMenuOpen');
      if (menu === 'true') this.isMenuOpen.set(true);
    } catch {
      // ignore
    }

    try {
      const collapsed = localStorage.getItem('dashboard.isSidebarCollapsed');
      if (collapsed === 'true') this.isSidebarCollapsed.set(true);
    } catch {
      // ignore
    }

    // Intercept browser back (popstate) using a native listener and Angular's
    // Location service. This lets us act before Router starts a navigation
    // and avoids using setTimeout hacks.
    // Push a guard state so the first "back" pops to this entry and
    // allows us to intercept the action and show a modal instead of
    // leaving the app.
    try {
      // Push two states: first the guard, then a normal empty state on top.
      // When the user presses back, the popped state's `event.state` will
      // be the guard state, which we can detect reliably.
      history.pushState({ dashboardGuard: true }, '', window.location.href);
      history.pushState({}, '', window.location.href);
    } catch {
      // ignore
    }

    // Fallback native listeners for extra visibility in some browsers/UI
    this._nativePopListener = (ev: PopStateEvent) => {
      this.onPopState(ev);
    };
    window.addEventListener('popstate', this._nativePopListener);
  }

  private _nativePopListener: ((e: PopStateEvent) => void) | null = null;
  private _beforeUnloadListener: ((e: BeforeUnloadEvent) => void) | null = null;

  ngOnDestroy() {
    if (this._nativePopListener) {
      window.removeEventListener('popstate', this._nativePopListener);
      this._nativePopListener = null;
    }
    if (this._beforeUnloadListener) {
      window.removeEventListener('beforeunload', this._beforeUnloadListener);
      this._beforeUnloadListener = null;
    }
  }

  private onPopState(ev: PopStateEvent) {
    // If the back button was pressed and it was our guard state, intercept it
    // and show the exit confirmation instead of navigating away
    if (ev.state && (ev.state as { dashboardGuard?: boolean }).dashboardGuard === true) {
      ev.preventDefault();
      // Re-push the guard state so back button can be used again if user cancels
      history.pushState({ dashboardGuard: true }, '', window.location.href);
      this.exitConfirmService.openExitConfirm();
    }
  }

  toggleMenu() {
    this.isMenuOpen.update((v) => !v);
    try {
      localStorage.setItem('dashboard.isMenuOpen', String(this.isMenuOpen()));
    } catch {
      /* ignore */
    }
  }

  closeMenu() {
    this.isMenuOpen.set(false);
    try {
      localStorage.setItem('dashboard.isMenuOpen', 'false');
    } catch {
      /* ignore */
    }
  }

  toggleSidebarCollapse() {
    this.isSidebarCollapsed.update((value) => !value);
    try {
      localStorage.setItem('dashboard.isSidebarCollapsed', String(this.isSidebarCollapsed()));
    } catch {
      /* ignore */
    }
  }

  loadStats() {
    this.isLoading.set(true);
    this.statsService.getStats().subscribe({
      next: async (data) => {
        // Soporte para respuestas envueltas en un objeto 'data'
        const response = data as { data?: WeddingStats } | WeddingStats;
        const finalData =
          'data' in response && response.data ? response.data : (response as WeddingStats);

        // ensure we have guests before computing declined fallback
        try {
          await this.guestService.loadGuests();
        } catch {
          // ignore errors, we'll compute from whatever we have
        }

        if (finalData.declined === undefined || finalData.declined === null) {
          const guests = this.guestService.guests();
          finalData.declined = guests.filter((g) => g.attending === 0).length;
        }

        this.stats.set(finalData);

        // cargar alergias (no depende de invitados)
        this.statsService.getAllergiesStats().subscribe({
          next: (res) => {
            const response = res as { data?: unknown } | unknown;
            const items =
              ('data' in (response as { data?: unknown })
                ? (response as { data?: unknown }).data
                : response) ?? [];

            const isCountable = (value: unknown): value is { count: number } => {
              return (
                value !== null &&
                typeof value === 'object' &&
                'count' in value &&
                typeof (value as { count: unknown }).count === 'number'
              );
            };

            let totalAllergies = 0;
            if (Array.isArray(items)) {
              items.forEach((item) => {
                if (isCountable(item)) {
                  totalAllergies += item.count;
                } else {
                  totalAllergies += 1;
                }
              });
            } else if (isCountable(items)) {
              totalAllergies = items.count;
            }
            this.allergiesCount.set(totalAllergies);
          },
          error: () => {
            // ignore
          },
        });

        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error fetching stats:', err);
        this.error.set('No se pudieron cargar las estadísticas.');
        this.isLoading.set(false);
      },
    });
  }

  setView(view: 'stats' | 'tables' | 'settings' | 'finances' | 'todos' | 'contacts' | 'music' | 'invitation') {
    this.currentView.set(view);
    try {
      localStorage.setItem('dashboard.currentView', view);
    } catch {
      /* ignore */
    }
    this.closeMenu();
  }

  logout() {
    this.closeMenu();
    this.exitConfirmService.openExitConfirm();
  }

  openDeclinedGuestsModal() {
    this.searchQuery.set('');
    this.showDeclinedGuestsModal.set(true);
  }

  closeDeclinedGuestsModal() {
    this.showDeclinedGuestsModal.set(false);
    this.searchQuery.set('');
  }

  openEditGuestModal(guest: Guest) {
    this.selectedGuestForEdit.set(guest);
    this.showEditGuestModal.set(true);
  }

  closeEditGuestModal() {
    this.showEditGuestModal.set(false);
    this.selectedGuestForEdit.set(null);
  }

  // Métodos para abrir el modal genérico con diferentes listas
  openGuestsModal(
    type: 'confirmed' | 'adults' | 'children' | 'unassigned' | 'transport' | 'allergies',
  ) {
    let title = '';
    let guestsList: Guest[] = [];

    switch (type) {
      case 'confirmed':
        title = 'Invitados Confirmados';
        guestsList = this.confirmedGuestsList();
        break;
      case 'adults':
        title = 'Invitados Adultos';
        guestsList = this.adultsGuestsList();
        break;
      case 'children':
        title = 'Invitados Niños';
        guestsList = this.childrenGuestsList();
        break;
      case 'unassigned':
        title = 'Invitados Sin Asignar';
        guestsList = this.unassignedGuestsList();
        break;
      case 'transport':
        title = 'Invitados que Necesitan Transporte';
        guestsList = this.transportGuestsList();
        break;
      case 'allergies':
        title = 'Invitados con Alergias';
        guestsList = this.allergiesGuestsList();
        break;
    }

    this.modalTitle.set(title);
    this.modalGuestsList.set(guestsList);
    this.modalShowActions.set(false); // Sin botones de acción
    this.searchQuery.set('');
    this.showGuestsModal.set(true);
  }

  closeGuestsModal() {
    this.showGuestsModal.set(false);
    this.modalGuestsList.set([]);
    this.searchQuery.set('');
  }

  private resolveGuestId(guest: Guest): string | null {
    return guest.id || guest.email || guest.phone || null;
  }

  async moveDeclinedToUnassigned(guest: Guest) {
    const guestId = this.resolveGuestId(guest);
    if (!guestId) return;

    try {
      await this.guestService.updateGuest(guestId, {
        attending: 1,
        attendance: true,
        tableId: null,
        seatNumber: null,
      });
    } catch (err) {
      console.error('Error moving declined guest to unassigned:', err);
    }
  }

  deleteDeclinedGuest(guest: Guest) {
    this.guestToDelete.set(guest);
    this.deleteGuestSource.set('declined');
    this.showGuestDeleteConfirm.set(true);
  }

  deleteGuestFromModal(guest: Guest) {
    this.guestToDelete.set(guest);
    this.deleteGuestSource.set('modal');
    this.showGuestDeleteConfirm.set(true);
  }

  async confirmDeleteGuest() {
    const guest = this.guestToDelete();
    if (!guest) return;

    const guestId = this.resolveGuestId(guest);
    if (!guestId) return;

    try {
      await this.guestService.deleteGuest(guestId);

      if (this.deleteGuestSource() === 'modal') {
        this.modalGuestsList.update((current) =>
          current.filter((item) => this.resolveGuestId(item) !== guestId),
        );
      }
    } catch (err) {
      console.error('Error deleting guest:', err);
    } finally {
      this.showGuestDeleteConfirm.set(false);
      this.guestToDelete.set(null);
      this.deleteGuestSource.set(null);
    }
  }

  cancelDeleteGuest() {
    this.showGuestDeleteConfirm.set(false);
    this.guestToDelete.set(null);
    this.deleteGuestSource.set(null);
  }
}
