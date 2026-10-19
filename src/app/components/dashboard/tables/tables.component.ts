import { Component, OnInit, inject, input, signal, computed, ElementRef, viewChild } from '@angular/core';

import { GuestService, Guest } from '../../../services/guest.service';
import { SettingsService } from '../../../services/settings.service';
import { TableService, TableConfig } from '../../../services/table.service';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, CdkDragEnd } from '@angular/cdk/drag-drop';
import { firstValueFrom, Subscription } from 'rxjs';
import { TablesLegendComponent } from './tables-legend/tables-legend.component';
import { TablesHeaderComponent } from './tables-header/tables-header.component';
import { TablesPrintViewComponent } from './tables-print-view/tables-print-view.component';
import { ExportPdfBtnComponent } from './export-pdf-btn/export-pdf-btn';
import { GuestFormModalComponent } from '../../../shared/components/guest-form-modal/guest-form-modal.component';
import { GuestDeleteModalComponent } from '../../../shared/components/guest-delete-modal/guest-delete-modal.component';

import { AssignSeatModalComponent } from './assign-seat-modal/assign-seat-modal';

export interface HallSearchResult {
  guest: Guest;
  location: 'seated' | 'queue';
  tableId: number | null;
  tableName: string | null;
  seatNumber: number | null;
}

export interface TableWithGuests {
  id: number;
  name: string | undefined;
  capacity: number;
  shape: string;
  posX: number | undefined;
  posY: number | undefined;
  captainIds?: number[] | null;
  guests: Guest[];
  rotation?: number;
  highchairs?: number;
}

interface SeatDropData {
  tableId: number;
  seatIndex: number;
}

type TableDropData = Guest[] | SeatDropData | number | null;
type TableShape = TableConfig['shape'];

interface TablePositionUpdate {
  id: number;
  posX: number;
  posY: number;
}

function isSeatDropData(value: TableDropData): value is SeatDropData {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTableShape(value: unknown): value is TableShape {
  return (
    value === 'round' || value === 'square' || value === 'rectangular' || value === 'presidential'
  );
}

@Component({
  selector: 'app-tables',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    FormsModule,
    TablesLegendComponent,
    TablesHeaderComponent,
    DragDropModule,
    ExportPdfBtnComponent,
    GuestFormModalComponent,
    GuestDeleteModalComponent,
    AssignSeatModalComponent,
    TablesPrintViewComponent,
  ],
  templateUrl: './tables.component.html',
  styleUrls: ['./tables-shared.css', './tables.component.css'],
})
export class TablesComponent implements OnInit {
  private guestService = inject(GuestService);
  private settingsService = inject(SettingsService);
  private tableService = inject(TableService);
  private fb = inject(FormBuilder);

  /** Slug del tenant (boda). Se reenvía al modal de invitado para enviarlo a Google Sheets como copia. */
  readonly tenantSlug = input<string>('');

  guests = this.guestService.guests;
  maxGuests = computed(() => this.settingsService.settings().max_guests_per_table);
  enableHighchairs = computed(() => this.settingsService.settings().enable_highchairs ?? false);
  //autoAssign = computed(() => this.settingsService.settings().auto_assign_tables ?? false);

  isLoading = signal(true);
  draggedGuest: Guest | null = null;

  readonly hallElement = viewChild.required<ElementRef>('hall');
  readonly scrollContainer = viewChild<ElementRef>('scrollContainer');
  readonly hallWrapper = viewChild<ElementRef>('hallWrapper');

  // Drag-to-scroll properties
  private isScrolling = false;
  private startX = 0;
  private startY = 0;
  private scrollLeft = 0;
  private scrollTop = 0;

  // Drag animation state
  draggingGuestId = signal<string | undefined>(undefined);
  newlySeatedIds = signal<Set<string>>(new Set());
  isReceivingGuest = signal<boolean>(false);

  // Modal para nuevo/editar invitado
  showAddModal = signal(false);
  selectedGuestForModal = signal<Guest | null>(null);

  // Modal para nueva mesa
  showCreateTableModal = signal(false);
  tableForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    capacity: [10, [Validators.required, Validators.min(1), Validators.max(25)]],
    shape: ['round', [Validators.required]],
    highchairs: [0, [Validators.min(0), Validators.max(10)]],
  });

  // Modal para confirmar borrado de mesa
  showDeleteConfirm = signal(false);
  tableIdToDelete = signal<number | null>(null);

  // Modal para confirmar borrado de invitado
  showGuestDeleteConfirm = signal(false);
  guestToDelete = signal<Guest | null>(null);

  // Modal para avisar de mesa llena
  showFullTableModal = signal(false);
  fullTableName = signal('');
  fullTableCapacity = signal(0);

  // Modal genérico para avisos/errores
  showGenericModal = signal(false);
  genericModalTitle = signal('');
  genericModalMessage = signal('');

  // Edición inline de nombres de mesa
  editingTableId = signal<number | null>(null);
  editingNameControl = new FormControl<string>('', { nonNullable: true });

  // Edición de tronas
  editingHighchairsTableId = signal<number | null>(null);
  editingHighchairsValue = signal<number>(0);

  searchTerm = signal<string>('');
  searchControl = new FormControl<string>('', { nonNullable: true });
  hallSearchTerm = signal<string>('');
  hallSearchControl = new FormControl<string>('', { nonNullable: true });
  highlightedTableId = signal<number | null>(null);
  isQueueHighlighted = signal<boolean>(false);
  selectedTablePanelId = signal<number | null>(null);
  showAssignSeatModal = signal<boolean>(false);
  assignSearchTerm = signal<string>('');
  assignSearchControl = new FormControl<string>('', { nonNullable: true });
  selectedGuestToAssign = signal<Guest | null>(null);
  selectedSeatToAssign = signal<number | null>(null);
  isEditLayoutMode = signal<boolean>(true);
  private tableWasDragged = false;

  // Fullscreen and zoom controls
  isFullscreen = signal<boolean>(false);
  zoomLevel = signal<number>(1);
  zoomPercentage = computed(() => Math.round(this.zoomLevel() * 100));

  private capacityControls = new Map<number, FormControl<number>>();
  private capacitySubs = new Map<number, Subscription>();

  // Organizar invitados por mesa siguiendo ESTRICTAMENTE la configuración
  tables = computed(() => {
    const guestList = this.guests();
    const configs = this.tableService.tables();

    if (!Array.isArray(configs) || configs.length === 0) return [];

    return configs
      .map((config) => {
        const tableId = Number(config.id);
        return {
          id: tableId,
          name: config.name,
          capacity: config.capacity || this.maxGuests(),
          shape: config.shape || 'round',
          posX: config.posX,
          posY: config.posY,
          captainIds: config.captainIds ?? null,
          rotation: config.rotation || 0,
          highchairs: config.highchairs || 0,
          guests: guestList.filter((g) => {
            if (g.attending === 0) return false;
            const guestTableId = Number(g.tableId || 0);
            if (guestTableId !== tableId || guestTableId === 0) return false;
            return g.seatNumber !== null && g.seatNumber !== undefined;
          }),
        };
      })
      .sort((a, b) => a.id - b.id);
  });

  totalHighchairs = computed(() => {
    return this.tables().reduce((total, t) => total + (t.highchairs || 0), 0);
  });

  unassignedGuests = computed(() => {
    const guestList = this.guests();
    const tableConfigs = this.tableService.tables();

    // Excluir siempre invitados que han rechazado
    const filteredList = guestList.filter((g) => g.attending !== 0 && g.attendance !== false);

    // Si no hay mesas cargadas aún, todos se ven como sin asignar (excepto rechazados)
    if (!tableConfigs || tableConfigs.length === 0) return filteredList;

    const validTableIds = new Set(tableConfigs.map((t) => Number(t.id)));

    return filteredList.filter((g) => {
      const tableId = Number(g.tableId || 0);
      if (tableId === 0 || !validTableIds.has(tableId)) {
        return true;
      }
      // siempre considerar sin asiento como "por asignar"
      if (g.seatNumber === null || g.seatNumber === undefined) {
        return true;
      }
      return false;
    });
  });

  filteredUnassignedGuests = computed(() => {
    const guests = this.unassignedGuests();
    const term = this.searchTerm().toLowerCase().trim();

    if (!term) return guests;

    return guests.filter(
      (g) =>
        g.name.toLowerCase().includes(term) ||
        (g.email && g.email.toLowerCase().includes(term)) ||
        (g.phone && g.phone.includes(term)),
    );
  });

  hallSearchResults = computed((): HallSearchResult[] => {
    const term = this.hallSearchTerm().toLowerCase().trim();
    if (!term) return [];

    const attending = this.guests().filter((g) => g.attending !== 0 && g.attendance !== false);
    const tableConfigs = this.tableService.tables();
    const tableNameById = new Map(
      tableConfigs.map((t) => [Number(t.id), t.name || `Mesa ${t.id}`]),
    );
    const validTableIds = new Set(tableConfigs.map((t) => Number(t.id)));

    return attending
      .filter(
        (g) =>
          g.name.toLowerCase().includes(term) ||
          (g.email && g.email.toLowerCase().includes(term)) ||
          (g.phone && g.phone.includes(term)),
      )
      .map((guest) => {
        const tableId = Number(guest.tableId || 0);
        const hasSeat = guest.seatNumber !== null && guest.seatNumber !== undefined;
        const isSeated = tableId > 0 && validTableIds.has(tableId) && hasSeat;

        if (isSeated) {
          return {
            guest,
            location: 'seated' as const,
            tableId,
            tableName: tableNameById.get(tableId) ?? `Mesa ${tableId}`,
            seatNumber: guest.seatNumber ?? null,
          };
        }

        return {
          guest,
          location: 'queue' as const,
          tableId: null,
          tableName: null,
          seatNumber: null,
        };
      });
  });

  selectedTablePanelData = computed((): (TableWithGuests & { sortedGuests: Guest[] }) | null => {
    const tableId = this.selectedTablePanelId();
    if (tableId === null) return null;

    const table = this.tables().find((t) => t.id === tableId);
    if (!table) return null;

    const sortedGuests = [...table.guests].sort(
      (a, b) => (a.seatNumber ?? 0) - (b.seatNumber ?? 0),
    );

    return { ...table, sortedGuests };
  });

  selectedTableFreeSeats = computed((): number[] => {
    const panel = this.selectedTablePanelData();
    if (!panel) return [];

    const occupied = new Set<number>();
    panel.sortedGuests.forEach((g) => {
      const n = g.seatNumber;
      if (n !== null && n !== undefined) occupied.add(Number(n));
    });

    const free: number[] = [];
    for (let i = 1; i <= panel.capacity; i++) {
      if (!occupied.has(i)) free.push(i);
    }
    return free;
  });

  /** Devuelve el número máximo de capitanes permitidos para una mesa */
  getMaxCaptainsForTable(shape: string): number {
    return shape === 'presidential' ? 2 : 1;
  }

  /** True si la mesa puede tener más capitanes */
  canAddMoreCaptains(): boolean {
    const panel = this.selectedTablePanelData();
    if (!panel) return false;
    const maxCaptains = this.getMaxCaptainsForTable(panel.shape);
    const currentCount = panel.captainIds?.length ?? 0;
    return currentCount < maxCaptains;
  }

  /** Devuelve los Guests que actúan como capitanes de la mesa abierta en el panel */
  panelCaptains = computed((): Guest[] => {
    const panel = this.selectedTablePanelData();
    if (!panel) return [];
    const allCaptainIds = panel.captainIds ?? [];
    if (allCaptainIds.length === 0) return [];
    return panel.sortedGuests.filter((g) => allCaptainIds.includes(Number(g.id)));
  });

  /** True si el invitado es capitán de la mesa abierta en el panel */
  isCaptainOnPanel(guest: Guest): boolean {
    const panel = this.selectedTablePanelData();
    if (!panel?.captainIds || panel.captainIds.length === 0) return false;
    return panel.captainIds.includes(Number(guest.id));
  }

  isCaptain(table: TableWithGuests, guest: Guest): boolean {
    if (!table.captainIds || !guest.id) return false;
    return table.captainIds.includes(Number(guest.id));
  }

  /** True si la mesa tiene al menos un capitán (para mostrar corona en la visual) */
  tableHasCaptain(tableId: number): boolean {
    const table = this.tables().find((t) => t.id === tableId);
    return !!(table?.captainIds && table.captainIds.length > 0);
  }

  /** True si el invitado es capitán de la mesa indicada (visual del salón) */
  isCaptainAtTable(table: TableWithGuests, guest: Guest): boolean {
    if (!table.captainIds || table.captainIds.length === 0 || !guest.id) return false;
    return table.captainIds.includes(Number(guest.id));
  }

  async setCaptain(guest: Guest) {
    const tableId = this.selectedTablePanelId();
    const panel = this.selectedTablePanelData();
    if (!tableId || !guest.id || !panel) return;

    const isSeated = panel.sortedGuests.some((g) => Number(g.id) === Number(guest.id));
    if (!isSeated) {
      this.triggerAlert(
        'Capitán no válido',
        'Solo puede ser capitán un invitado ya sentado en esta mesa.',
      );
      return;
    }

    const maxCaptains = this.getMaxCaptainsForTable(panel.shape);
    const currentCaptains = panel.captainIds ?? [];

    // Check if already a captain
    if (currentCaptains.includes(Number(guest.id))) {
      this.triggerAlert('Ya es capitán', `${guest.name} ya es capitán de esta mesa.`);
      return;
    }

    // Check if max captains reached
    if (currentCaptains.length >= maxCaptains) {
      if (maxCaptains === 1) {
        this.triggerAlert(
          'Capitán existente',
          'Esta mesa ya tiene un capitán. Quítalo antes de asignar otro.',
        );
      } else {
        this.triggerAlert(
          'Máximo de capitanes',
          `La mesa presidencial puede tener hasta ${maxCaptains} capitanes.`,
        );
      }
      return;
    }

    // Add to captains list
    const newCaptainIds = [...currentCaptains, Number(guest.id)];

    // Actualización optimista
    this.tableService.tables.update((current) =>
      current.map((t) => (t.id === tableId ? { ...t, captainIds: newCaptainIds } : t)),
    );

    try {
      await firstValueFrom(this.tableService.updateTable(tableId, { captainIds: newCaptainIds }));
    } catch (error) {
      console.error('Error setting captain:', error);
      // Revertir optimista
      this.tableService.tables.update((current) =>
        current.map((t) => (t.id === tableId ? { ...t, captainIds: currentCaptains } : t)),
      );
      this.triggerAlert('Error', 'No se pudo asignar el capitán. Inténtalo de nuevo.');
    }
  }

  async removeCaptain(guest: Guest) {
    const tableId = this.selectedTablePanelId();
    const panel = this.selectedTablePanelData();
    if (!tableId || !guest.id || !panel) return;

    const currentCaptains = panel.captainIds ?? [];
    const guestIdNum = Number(guest.id);

    // Remove the captain from the list
    const newCaptainIds = currentCaptains.filter((id) => id !== guestIdNum);

    // Actualización optimista
    this.tableService.tables.update((current) =>
      current.map((t) => (t.id === tableId ? { ...t, captainIds: newCaptainIds } : t)),
    );

    try {
      await firstValueFrom(this.tableService.updateTable(tableId, { captainIds: newCaptainIds }));
    } catch (error) {
      console.error('Error removing captain:', error);
      // Revertir optimista
      this.tableService.tables.update((current) =>
        current.map((t) => (t.id === tableId ? { ...t, captainIds: currentCaptains } : t)),
      );
      this.triggerAlert('Error', 'No se pudo quitar el capitán. Inténtalo de nuevo.');
    }
  }

  assignableGuests = computed((): Guest[] => {
    const term = this.assignSearchTerm().toLowerCase().trim();
    const list = this.unassignedGuests();
    if (!term) return list;

    return list.filter(
      (g) =>
        g.name.toLowerCase().includes(term) ||
        (g.email && g.email.toLowerCase().includes(term)) ||
        (g.phone && g.phone.includes(term)),
    );
  });

  hallHeight = computed(() => {
    const currentTables = this.tables();
    if (currentTables.length === 0) return 1200;

    let maxBottom = 0;
    currentTables.forEach((t) => {
      if (t.posX !== undefined && t.posY !== undefined) {
        const height = t.shape === 'rectangular' ? 340 : t.shape === 'presidential' ? 240 : 340;
        const bottom = t.posY + height + 110; // 110px de margen
        if (bottom > maxBottom) maxBottom = bottom;
      }
    });

    return Math.max(1200, maxBottom);
  });

  hallWidth = computed(() => {
    const currentTables = this.tables();
    if (currentTables.length === 0) return 1000;

    let maxRight = 0;
    currentTables.forEach((t) => {
      if (t.posX !== undefined && t.posY !== undefined) {
        const width =
          t.shape === 'rectangular' || t.shape === 'presidential'
            ? this.getRectTableWidth(t.capacity, t.shape) + 60
            : 340;
        const right = t.posX + width + 110; // 110px de margen
        if (right > maxRight) maxRight = right;
      }
    });

    return Math.max(1000, maxRight);
  });

  ngOnInit() {
    this.loadData();
    this.searchControl.valueChanges.subscribe((v) => this.searchTerm.set((v ?? '').toString()));
    this.hallSearchControl.valueChanges.subscribe((v) =>
      this.hallSearchTerm.set((v ?? '').toString()),
    );
    this.assignSearchControl.valueChanges.subscribe((v) =>
      this.assignSearchTerm.set((v ?? '').toString()),
    );

    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
  }

  getHallSearchLocationMessage(result: HallSearchResult): string {
    if (result.location === 'seated' && result.tableName) {
      const seatInfo = result.seatNumber ? ` (asiento ${result.seatNumber})` : '';
      return `${result.guest.name} está sentado en ${result.tableName}${seatInfo}`;
    }
    return `${result.guest.name} está en cola de recepción (sin asiento)`;
  }

  onHallSearchSelect(result: HallSearchResult) {
    this.locateGuest(result);
  }

  onHallSearchKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    const results = this.hallSearchResults();
    if (results.length === 1) {
      this.locateGuest(results[0]);
    }
  }

  locateGuest(result: HallSearchResult) {
    if (result.location === 'seated' && result.tableId !== null) {
      this.highlightTable(result.tableId);
      this.scrollToTable(result.tableId);
      return;
    }
    this.highlightQueue();
  }

  highlightTable(tableId: number) {
    this.highlightedTableId.set(tableId);
    setTimeout(() => this.highlightedTableId.set(null), 3000);
  }

  scrollToTable(tableId: number) {
    setTimeout(() => {
      const el = document.querySelector(`[data-table-id="${tableId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 50);
  }

  highlightQueue() {
    this.isQueueHighlighted.set(true);
    setTimeout(() => this.isQueueHighlighted.set(false), 3000);
    document
      .querySelector('.reception-queue')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  openTablePanel(table: TableWithGuests) {
    this.selectedTablePanelId.set(table.id);
  }

  closeTablePanel() {
    this.selectedTablePanelId.set(null);
  }

  onTableDragStarted() {
    this.tableWasDragged = true;
  }

  onTableSurfaceClick(event: Event, table: TableWithGuests) {
    const target = event.target as HTMLElement;
    if (
      target.closest('.table-config-overlay') ||
      target.closest('.edit-table-input') ||
      target.closest('.table-num')
    ) {
      return;
    }

    if (this.tableWasDragged) {
      this.tableWasDragged = false;
      return;
    }

    this.openTablePanel(table);
  }

  onTablePanelEdit(guest: Guest, event: MouseEvent) {
    event.stopPropagation();
    this.openEditModal(guest);
  }

  onTablePanelDelete(guest: Guest, event: MouseEvent) {
    event.stopPropagation();
    this.deleteGuest(guest);
  }

  async onTablePanelUnseat(guest: Guest, event: MouseEvent) {
    event.stopPropagation();
    const guestId = this.guestKey(guest);
    if (!guestId) return;

    try {
      await this.guestService.updateGuestTable(guestId, null, null);
    } catch (error) {
      console.error('Error unseating guest:', error);
      this.triggerAlert(
        'Error',
        'No se pudo enviar el invitado a la cola. Por favor, inténtalo de nuevo.',
      );
    }
  }

  openAssignSeatModalForSelectedTable() {
    const panel = this.selectedTablePanelData();
    if (!panel) return;

    if (this.selectedTableFreeSeats().length === 0) {
      this.triggerAlert('Mesa completa', 'No hay asientos libres en esta mesa.');
      return;
    }

    this.selectedGuestToAssign.set(null);
    this.selectedSeatToAssign.set(this.selectedTableFreeSeats()[0] ?? null);
    this.assignSearchControl.setValue('');
    this.showAssignSeatModal.set(true);
  }

  closeAssignSeatModal() {
    this.showAssignSeatModal.set(false);
    this.selectedGuestToAssign.set(null);
    this.selectedSeatToAssign.set(null);
  }

  selectGuestToAssign(guest: Guest) {
    this.selectedGuestToAssign.set(guest);
  }

  isGuestSelectedForAssign(guest: Guest): boolean {
    const selected = this.selectedGuestToAssign();
    if (!selected) return false;
    return this.guestKey(selected) === this.guestKey(guest);
  }

  onAssignSeatChange(value: string) {
    const n = Number(value);
    this.selectedSeatToAssign.set(Number.isFinite(n) ? n : null);
  }

  async confirmAssignSeat() {
    const panel = this.selectedTablePanelData();
    const guest = this.selectedGuestToAssign();
    const seat = this.selectedSeatToAssign();

    if (!panel || !guest || seat === null) return;

    const guestId = this.guestKey(guest);
    if (!guestId) return;

    if (!this.selectedTableFreeSeats().includes(seat)) {
      this.triggerAlert('Asiento no disponible', 'Ese asiento ya no está libre. Elige otro.');
      return;
    }

    try {
      await this.guestService.updateGuestTable(guestId, panel.id, seat);
      this.closeAssignSeatModal();
    } catch (error) {
      console.error('Error assigning guest seat:', error);
      this.triggerAlert('Error', 'No se pudo asignar el asiento. Por favor, inténtalo de nuevo.');
    }
  }

  getCapacityControl(tableId: number, initialCapacity: number): FormControl<number> {
    const existing = this.capacityControls.get(tableId);
    if (existing) return existing;

    const ctrl = new FormControl<number>(Number(initialCapacity || 1), { nonNullable: true });
    this.capacityControls.set(tableId, ctrl);

    const sub = ctrl.valueChanges.subscribe((v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return;
      this.updateTableCapacity(tableId, n);
    });
    this.capacitySubs.set(tableId, sub);
    return ctrl;
  }

  async loadData() {
    this.isLoading.set(true);
    try {
      await this.guestService.loadGuests();

      this.settingsService.loadSettings().subscribe();
      this.tableService.loadTables().subscribe();
    } catch (error) {
      console.error('Error loading tables data:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Returns the best available unique key for a guest (used in templates). */
  guestKey(guest: Guest): string {
    return guest.id ?? guest.email ?? guest.phone ?? '';
  }

  // --- HTML5 Drag & Drop Handlers ---

  onScrollMouseDown(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // Ignorar si se hace clic en una mesa, invitado o botones
    if (
      target.closest('.table-container') ||
      target.closest('.guest-item') ||
      target.closest('button') ||
      target.closest('input')
    ) {
      return;
    }

    this.isScrolling = true;
    const el = this.scrollContainer()?.nativeElement;
    if (el) {
      el.style.cursor = 'grabbing';
      this.startX = event.pageX - el.offsetLeft;
      this.startY = event.pageY - el.offsetTop;
      this.scrollLeft = el.scrollLeft;
      this.scrollTop = el.scrollTop;
    }
  }

  onScrollMouseMove(event: MouseEvent) {
    if (!this.isScrolling) return;

    event.preventDefault(); // Prevenir selección de texto
    const el = this.scrollContainer()?.nativeElement;
    if (el) {
      const x = event.pageX - el.offsetLeft;
      const y = event.pageY - el.offsetTop;
      const walkX = (x - this.startX) * 1.5; // Velocidad de scroll
      const walkY = (y - this.startY) * 1.5;
      el.scrollLeft = this.scrollLeft - walkX;
      el.scrollTop = this.scrollTop - walkY;
    }
  }

  onScrollMouseUp() {
    this.isScrolling = false;
    const el = this.scrollContainer()?.nativeElement;
    if (el) {
      el.style.cursor = '';
    }
  }

  /** Previene la animación de retorno al soltar un invitado */
  onGuestDragEnded(event: CdkDragEnd) {
    // Simplemente resetear sin animación
    if (event.source) {
      event.source.reset();
    }
  }

  onReceptionQueueEntered() {
    this.isReceivingGuest.set(true);
  }

  onReceptionQueueExited() {
    this.isReceivingGuest.set(false);
  }

  /** Returns the guest at a specific seat of a table (1-indexed: 1, 2, 3...) */
  getGuestAtSeat(tableId: number, seatIndex: number): Guest | undefined {
    return this.guests().find((g) => Number(g.tableId) === tableId && g.seatNumber === seatIndex);
  }

  async onDrop<T extends TableDropData>(event: CdkDragDrop<T, unknown, Guest>) {
    const guest = event.item.data as Guest;
    const guestId = this.guestKey(guest);

    if (!guestId) return;

    const targetData = event.container.data;

    // Normalizar destino
    let tableId: number | null = null;
    let seatNumber: number | null = null;

    if (targetData === undefined || targetData === null) {
      // Cola de recepción
      tableId = null;
      seatNumber = null;
    } else if (typeof targetData === 'number') {
      // Dropped on the table background (auto-assign seat)
      tableId = targetData;
      const table = this.tables().find((t) => t.id === tableId);
      if (table) {
        const currentGuestId = this.guestKey(guest);
        // Find first free seat (1-indexed: 1, 2, 3..., excluding the dragged guest's current position)
        for (let i = 1; i <= table.capacity; i++) {
          const occupant = this.getGuestAtSeat(tableId, i);
          if (!occupant || this.guestKey(occupant) === currentGuestId) {
            seatNumber = i;
            break;
          }
        }
        if (seatNumber === null) {
          this.fullTableName.set(table?.name || '');
          this.fullTableCapacity.set(table?.capacity || 0);
          this.showFullTableModal.set(true);
          return;
        }
      }
    } else if (isSeatDropData(targetData)) {
      // Dropped on a specific seat
      tableId = targetData.tableId;
      seatNumber = targetData.seatIndex;
    }

    if (!guest) return;

    // Si ya hay alguien en ese asiento de esa mesa, y venimos de otro sitio, swap
    if (tableId !== null && seatNumber !== null) {
      const existingGuest = this.getGuestAtSeat(tableId, seatNumber);
      if (existingGuest && this.guestKey(existingGuest) !== guestId) {
        // Swap: move the existing guest to the previous seat of the dragged guest
        const prevTableId =
          guest.tableId !== undefined && guest.tableId !== 0 ? Number(guest.tableId) : null;
        const prevSeatNumber =
          guest.seatNumber !== undefined && guest.seatNumber !== null
            ? Number(guest.seatNumber)
            : null;
        const existingGuestId = this.guestKey(existingGuest);

        try {
          // IMPORTANTE: Primero mover al invitado existente a un lugar temporal (cola de recepción)
          // para liberar el asiento y evitar problemas de capacidad
          await this.guestService.updateGuestTable(existingGuestId, null, null);

          // Luego mover al invitado arrastrado al nuevo asiento
          await this.guestService.updateGuestTable(guestId, tableId, seatNumber);

          // Finalmente mover al invitado que estaba al asiento original del arrastrado
          await this.guestService.updateGuestTable(existingGuestId, prevTableId, prevSeatNumber);

          // Trigger sit-down animation for both guests
          if (tableId !== null) {
            const sid = this.guestKey(guest);
            if (sid) {
              this.newlySeatedIds.update((s) => new Set([...s, sid]));
              setTimeout(() => {
                this.newlySeatedIds.update((s) => {
                  const n = new Set(s);
                  n.delete(sid);
                  return n;
                });
              }, 1500);
            }
          }
          if (prevTableId !== null) {
            const eid = existingGuest.id ?? existingGuest.email ?? existingGuest.phone;
            if (eid) {
              this.newlySeatedIds.update((s) => new Set([...s, eid]));
              setTimeout(() => {
                this.newlySeatedIds.update((s) => {
                  const n = new Set(s);
                  n.delete(eid);
                  return n;
                });
              }, 1500);
            }
          }
        } catch (error) {
          console.error('Error swapping guests:', error);
        }
        return; // Exit early after swap
      }
    }

    try {
      await this.guestService.updateGuestTable(guestId, tableId, seatNumber);

      // Trigger sit-down animation
      if (tableId !== null) {
        const sid = this.guestKey(guest);
        if (sid) {
          this.newlySeatedIds.update((s) => new Set([...s, sid]));
          setTimeout(() => {
            this.newlySeatedIds.update((s) => {
              const n = new Set(s);
              n.delete(sid);
              return n;
            });
          }, 1500);
        }
      }
    } catch (error) {
      console.error('Error updating guest table/seat:', error);
    }
  }

  deleteGuest(guest: Guest) {
    this.guestToDelete.set(guest);
    this.showGuestDeleteConfirm.set(true);
  }

  async confirmDeleteGuest() {
    const guest = this.guestToDelete();
    // use id if available, otherwise fall back to email/phone so we at least remove from state
    const guestId = guest?.id || guest?.email || guest?.phone;
    if (!guestId) return;

    try {
      this.showGuestDeleteConfirm.set(false);
      await this.guestService.deleteGuest(guestId);
    } catch (error) {
      console.error('Error deleting guest:', error);
      this.triggerAlert('Error', 'No se pudo eliminar al invitado. Por favor, inténtalo de nuevo.');
    } finally {
      this.guestToDelete.set(null);
    }
  }

  cancelDeleteGuest() {
    this.showGuestDeleteConfirm.set(false);
    this.guestToDelete.set(null);
  }

  openAddModal() {
    this.selectedGuestForModal.set(null);
    this.showAddModal.set(true);
  }

  closeAddModal() {
    this.showAddModal.set(false);
    this.selectedGuestForModal.set(null);
  }

  openEditModal(guest: Guest) {
    this.selectedGuestForModal.set(guest);
    this.showAddModal.set(true);
  }

  triggerAlert(title: string, message: string) {
    this.genericModalTitle.set(title);
    this.genericModalMessage.set(message);
    this.showGenericModal.set(true);
  }

  closeGenericModal() {
    this.showGenericModal.set(false);
  }
  openCreateTableModal() {
    const currentTables = this.tableService.tables();
    const suggestedName = `Mesa ${currentTables.length + 1}`;

    this.tableForm.reset({
      name: suggestedName,
      capacity: this.maxGuests() || 10,
      shape: 'round',
    });
    this.showCreateTableModal.set(true);
  }

  closeCreateTableModal() {
    this.showCreateTableModal.set(false);
  }

  async confirmAddTable() {
    if (this.tableForm.invalid) {
      this.tableForm.markAllAsTouched();
      return;
    }
    const data = this.tableForm.getRawValue() as {
      name: string;
      capacity: number;
      shape: unknown;
    };
    const currentTables = this.tableService.tables();
    const shape = isTableShape(data.shape) ? data.shape : 'round';

    // Validación: Nombre duplicado
    const duplicate = currentTables.find(
      (t) =>
        (t.name || '').toLowerCase() ===
        String(data.name || '')
          .trim()
          .toLowerCase(),
    );
    if (duplicate) {
      this.triggerAlert(
        'Nombre Duplicado',
        `Ya existe una mesa con el nombre "${data.name}". Por favor, elige uno diferente.`,
      );
      return;
    }

    const nextId = currentTables.length > 0 ? Math.max(...currentTables.map((t) => t.id)) + 1 : 1;

    try {
      this.isLoading.set(true);
      await firstValueFrom(
        this.tableService.addTable({
          id: nextId,
          name: String(data.name || `Mesa ${currentTables.length + 1}`),
          capacity: Number(data.capacity),
          shape,
        }),
      );
      this.closeCreateTableModal();
    } catch (error) {
      console.error('Error adding table:', error);
      // Fallback local
      this.tableService.tables.update((t) => [
        ...t,
        {
          id: nextId,
          name: String(data.name || `Mesa ${currentTables.length + 1}`),
          shape,
          capacity: Number(data.capacity),
        },
      ]);
      this.closeCreateTableModal();
    } finally {
      this.isLoading.set(false);
    }
  }

  async toggleTableShape(id: number, currentShape: string) {
    const shapes: TableShape[] = ['round', 'square', 'rectangular', 'presidential'];
    const currentIndex = isTableShape(currentShape) ? shapes.indexOf(currentShape) : 0;
    const nextIndex = (currentIndex + 1) % shapes.length;
    const newShape = shapes[nextIndex];

    // Actualización optimista local
    this.tableService.tables.update((current) =>
      current.map((t) => (t.id === id ? { ...t, shape: newShape } : t)),
    );

    try {
      await firstValueFrom(this.tableService.updateTable(id, { shape: newShape }));
    } catch (error) {
      console.error('Error updating table shape:', error);
    }
  }

  async rotateTable(id: number, currentRotation: number) {
    const normalized = (((Number(currentRotation) || 0) % 360) + 360) % 360;
    const newRotation = normalized === 90 ? 0 : 90;

    // Actualización optimista local
    this.tableService.tables.update((current) =>
      current.map((t) => (t.id === id ? { ...t, rotation: newRotation } : t)),
    );

    try {
      await firstValueFrom(this.tableService.updateTable(id, { rotation: newRotation }));
    } catch (error) {
      console.error('Error updating table rotation:', error);
      this.tableService.tables.update((current) =>
        current.map((t) => (t.id === id ? { ...t, rotation: normalized } : t)),
      );
      this.triggerAlert('Error', 'No se pudo girar la mesa. Inténtalo de nuevo.');
    }
  }

  onTableDragEnded(event: CdkDragEnd, tableId: number) {
    if (!this.isEditLayoutMode()) {
      this.tableWasDragged = false;
      return;
    }

    const element = event.source.getRootElement() as HTMLElement;
    const table = this.tableService.tables().find((t) => t.id === tableId);
    const dragPos = event.source.getFreeDragPosition();
    const baseX = table?.posX ?? element.offsetLeft;
    const baseY = table?.posY ?? element.offsetTop;
    const posX = Math.round(baseX + dragPos.x);
    const posY = Math.round(baseY + dragPos.y);

    // Actualización optimista local en el servicio
    this.tableService.tables.update((current) =>
      current.map((t) => (t.id === tableId ? { ...t, posX, posY } : t)),
    );

    // Resetear la transformación del CDK para que el elemento se posicione puramente por style.left/top
    event.source.reset();

    // Persistir en servidor con los valores exactos calculados
    this.tableService.updateTable(tableId, { posX, posY }).subscribe({
      error: (err) => console.error('Error saving table position:', err),
    });

    setTimeout(() => {
      this.tableWasDragged = false;
    }, 150);
  }

  toggleEditLayout() {
    const enteringEditMode = !this.isEditLayoutMode();

    if (enteringEditMode) {
      // CAPTURA: Antes de activar el modo absoluto, guardamos dónde están las mesas en el grid
      const grid = document.querySelector('.tables-grid');
      if (grid) {
        const containers = grid.querySelectorAll('.table-container') as NodeListOf<HTMLElement>;
        const updates: TablePositionUpdate[] = [];

        containers.forEach((container) => {
          const id = Number(container.getAttribute('data-table-id'));
          if (id) {
            // Capturamos el offset respecto al grid
            updates.push({
              id,
              posX: container.offsetLeft,
              posY: container.offsetTop,
            });
          }
        });

        if (updates.length > 0) {
          this.tableService.tables.update((current) =>
            current.map((t) => {
              const match = updates.find((u) => u.id === t.id);
              return match ? { ...t, posX: match.posX, posY: match.posY } : t;
            }),
          );
        }
      }
    }

    this.isEditLayoutMode.set(enteringEditMode);
  }

  async updateTableCapacity(id: number, newCapacity: number) {
    const table = this.tables().find((t) => t.id === id);
    if (!table) return;

    // Identificar invitados que están en asientos que van a desaparecer (1-indexed: asientos > newCapacity)
    const guestsInRemovedSeats = table.guests.filter(
      (g) => g.seatNumber !== undefined && g.seatNumber !== null && g.seatNumber > newCapacity,
    );

    // Si quedan más invitados que la nueva capacidad (ej. invitados sin asiento específico), también los sacamos
    const validGuests = table.guests.filter((g) => !guestsInRemovedSeats.includes(g));
    const extraGuestsToUnassign =
      validGuests.length > newCapacity ? validGuests.slice(newCapacity) : [];

    const overflowingGuests = [...guestsInRemovedSeats, ...extraGuestsToUnassign];

    // Unassign overflowing guests
    for (const guest of overflowingGuests) {
      if (guest.id) {
        await this.guestService.updateGuestTable(guest.id, null);
      }
    }

    // Actualización optimista local de la mesa
    this.tableService.tables.update((current) =>
      current.map((t) => (t.id === id ? { ...t, capacity: newCapacity } : t)),
    );

    try {
      await firstValueFrom(this.tableService.updateTable(id, { capacity: newCapacity }));
    } catch (error) {
      console.error('Error updating table capacity:', error);
    }
  }

  startEditingTable(id: number, currentName: string | undefined) {
    this.editingNameControl.setValue(currentName || `Mesa ${id}`);
    this.editingTableId.set(id);
  }

  async saveTableName(id: number) {
    const newName = (this.editingNameControl.value || '').trim();

    if (!newName) {
      this.editingTableId.set(null);
      return;
    }

    // Validación: Nombre duplicado (excluyendo la mesa actual)
    const currentTables = this.tableService.tables();
    const duplicate = currentTables.find(
      (t) => t.id !== id && (t.name || '').toLowerCase() === newName.toLowerCase(),
    );

    if (duplicate) {
      this.triggerAlert('Nombre Duplicado', `Ya existe otra mesa con el nombre "${newName}".`);
      this.editingTableId.set(null);
      return;
    }

    this.editingTableId.set(null);

    // Actualización optimista local
    this.tableService.tables.update((current) =>
      current.map((t) => (t.id === id ? { ...t, name: newName } : t)),
    );

    try {
      await firstValueFrom(this.tableService.updateTable(id, { name: newName }));
    } catch (error) {
      console.error('Error updating table name:', error);
    }
  }

  async saveHighchairs(id: number) {
    const newHighchairs = Math.max(0, Math.min(10, Number(this.editingHighchairsValue()) || 0));

    // Actualización optimista local
    this.tableService.tables.update((current) =>
      current.map((t) => (t.id === id ? { ...t, highchairs: newHighchairs } : t)),
    );

    try {
      await firstValueFrom(this.tableService.updateTable(id, { highchairs: newHighchairs }));
    } catch (error) {
      console.error('Error updating table highchairs:', error);
    }

    this.editingHighchairsTableId.set(null);
    this.editingHighchairsValue.set(0);
  }

  async updateHighchairsDirectly(id: number, newValue: number) {
    const newHighchairs = Math.max(0, Math.min(10, newValue));

    // Actualización optimista local
    this.tableService.tables.update((current) =>
      current.map((t) => (t.id === id ? { ...t, highchairs: newHighchairs } : t)),
    );

    try {
      await firstValueFrom(this.tableService.updateTable(id, { highchairs: newHighchairs }));
    } catch (error) {
      console.error('Error updating table highchairs:', error);
    }
  }

  startEditingHighchairs(tableId: number, currentValue: number) {
    this.editingHighchairsTableId.set(tableId);
    this.editingHighchairsValue.set(currentValue || 0);
  }

  cancelEditingHighchairs() {
    this.editingHighchairsTableId.set(null);
    this.editingHighchairsValue.set(0);
  }

  increaseHighchairs() {
    this.editingHighchairsValue.update((v) => Math.min(10, v + 1));
  }

  decreaseHighchairs() {
    this.editingHighchairsValue.update((v) => Math.max(0, v - 1));
  }

  onHighchairsInputChange(value: string): void {
    const num = Math.max(0, Math.min(10, Number(value) || 0));
    this.editingHighchairsValue.set(num);
  }

  deleteTable(id: number) {
    this.tableIdToDelete.set(id);
    this.showDeleteConfirm.set(true);
  }

  async confirmDeleteTable() {
    const id = this.tableIdToDelete();
    if (id === null) return;

    // Actualización optimista local
    this.tableService.tables.update((current) => current.filter((t) => t.id !== id));

    // Actualizar invitados localmente (se podría mover al servicio pero aquí es mesa-específico)
    this.guestService.guests.update((list) =>
      list.map((g) => (g.tableId === id ? { ...g, tableId: null } : g)),
    );

    try {
      this.showDeleteConfirm.set(false);
      await firstValueFrom(this.tableService.deleteTable(id));
    } catch (error) {
      console.error('Error deleting table:', error);
    } finally {
      this.tableIdToDelete.set(null);
    }
  }

  cancelDeleteTable() {
    this.showDeleteConfirm.set(false);
    this.tableIdToDelete.set(null);
  }

  getTableNameToDelete(): string {
    const id = this.tableIdToDelete();
    if (id === null) return '';
    const table = this.tableService.tables().find((t) => t.id === id);
    return table?.name || `Mesa ${id}`;
  }

  closeFullTableModal() {
    this.showFullTableModal.set(false);
    this.fullTableName.set('');
    this.fullTableCapacity.set(0);
  }

  getMenuClass(mealType?: string): string {
    if (!mealType) return 'menu-normal';
    const type = mealType.toLowerCase();
    if (type.includes('vege')) return 'menu-vegetarian';
    if (type.includes('vegan')) return 'menu-vegan';
    if (type.includes('celia') || type.includes('gluten')) return 'menu-celiac';
    if (type.includes('lacto')) return 'menu-lactose';
    if (type.includes('fruto')) return 'menu-nuts';
    if (type.includes('kid') || type.includes('infant')) return 'menu-kid';
    return 'menu-normal';
  }

  isBottomSeat(index: number, total: number): boolean {
    if (total === 0) return false;
    const angle = (360 / total) * index;
    return angle > 45 && angle < 135;
  }

  getSequence(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

  /**
   * Seat spacing in px for rectangular/presidential tables.
   * Keeps seats comfortably spaced: min 55px, max 80px.
   */
  getRectSeatSpacing(capacity: number, shape: string): number {
    const seatsPerSide = shape === 'presidential' ? capacity : Math.ceil(capacity / 2);
    // Shrink spacing a little for large tables to keep them manageable
    if (seatsPerSide <= 4) return 75;
    if (seatsPerSide <= 6) return 68;
    if (seatsPerSide <= 8) return 62;
    return 56;
  }

  /** Width of the table-surface div in px */
  getRectTableWidth(
    capacity: number,
    shape: 'rectangular' | 'presidential' | 'round' | 'square',
  ): number {
    if (shape !== 'rectangular' && shape !== 'presidential') return 0;
    const layoutSeats = shape === 'presidential' ? capacity : Math.ceil(capacity / 2);
    return layoutSeats * 75 + 30; // 75px per seat slot + 30px padding
  }

  getSeatX(shape: string, capacity: number, seatIdx: number): number {
    if (shape === 'round') {
      const angle = (360 / capacity) * seatIdx;
      const rad = (angle * Math.PI) / 180;
      return 170 + 108 * Math.cos(rad);
    } else if (shape === 'square') {
      const radius = this.isBottomSeat(seatIdx, capacity) ? 125 : 112;
      const angle = (360 / capacity) * seatIdx;
      const rad = (angle * Math.PI) / 180;
      return 170 + radius * Math.cos(rad);
    } else if (shape === 'rectangular') {
      const totalOnSide = Math.ceil(capacity / 2);
      const sideIndex = seatIdx % totalOnSide;
      const width = this.getRectTableWidth(capacity, 'rectangular') + 60;
      const seatSpacing = this.getRectSeatSpacing(capacity, shape);
      const translateX = (sideIndex - (totalOnSide - 1) / 2) * seatSpacing;
      return width / 2 + translateX;
    } else if (shape === 'presidential') {
      const totalOnSide = capacity;
      const sideIndex = seatIdx;
      const width = this.getRectTableWidth(capacity, 'presidential') + 60;
      const seatSpacing = this.getRectSeatSpacing(capacity, shape);
      const translateX = (sideIndex - (totalOnSide - 1) / 2) * seatSpacing;
      return width / 2 + translateX;
    }
    return 0;
  }

  getSeatY(shape: string, capacity: number, seatIdx: number): number {
    if (shape === 'round') {
      const angle = (360 / capacity) * seatIdx;
      const rad = (angle * Math.PI) / 180;
      return 170 + 108 * Math.sin(rad);
    } else if (shape === 'square') {
      const radius = this.isBottomSeat(seatIdx, capacity) ? 125 : 112;
      const angle = (360 / capacity) * seatIdx;
      const rad = (angle * Math.PI) / 180;
      return 170 + radius * Math.sin(rad);
    } else if (shape === 'rectangular') {
      const totalOnSide = Math.ceil(capacity / 2);
      const isBottom = seatIdx >= totalOnSide;
      const offsetY = isBottom ? 100 : -100;
      return 170 + offsetY;
    } else if (shape === 'presidential') {
      return 120 + 90;
    }
    return 0;
  }

  // Fullscreen functionality
  toggleFullscreen() {
    const hallEl = this.hallWrapper()?.nativeElement;
    if (!hallEl) return;

    if (!document.fullscreenElement) {
      hallEl
        .requestFullscreen()
        .then(() => {
          this.isFullscreen.set(true);
        })
        .catch((err: unknown) => {
          console.error('Error entering fullscreen:', err);
        });
    } else {
      document
        .exitFullscreen()
        .then(() => {
          this.isFullscreen.set(false);
        })
        .catch((err: unknown) => {
          console.error('Error exiting fullscreen:', err);
        });
    }
  }

  // Zoom functionality
  zoomIn() {
    const currentZoom = this.zoomLevel();
    if (currentZoom < 2) {
      this.zoomLevel.set(currentZoom + 0.1);
    }
  }

  zoomOut() {
    const currentZoom = this.zoomLevel();
    if (currentZoom > 0.5) {
      this.zoomLevel.set(currentZoom - 0.1);
    }
  }

  resetZoom() {
    this.zoomLevel.set(1);
  }

  // Listen for fullscreen changes
  private onFullscreenChange() {
    this.isFullscreen.set(!!document.fullscreenElement);
  }
}
