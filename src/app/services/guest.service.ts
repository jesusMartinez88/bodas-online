import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { SettingsService } from './settings.service';
import { TableService } from './table.service';
import { ApiResponse, GuestEntity } from '../../types/api';
import confetti from 'canvas-confetti';

export interface Guest {
  id?: string;
  name: string;
  email: string;
  phone: string;
  attending: number;
  attendance?: boolean;
  adults?: number;
  children?: number;
  isAdult?: number;
  mealType: string;
  needsTransport: boolean;
  isSavedInBbdd: boolean;
  sendEmail?: boolean;
  tableId?: number | null; // Primary field for backend assignment
  tableName?: string | number; // Fallback field
  seatNumber?: number | null; // Position in the table
  allergies?: string;
  notes?: string;
}

type JsonpCallback = (data: Record<string, unknown>) => void;
type JsonpCallbackWindow = Window & Record<string, JsonpCallback | undefined>;

declare global {
  interface Window {
    NG_APP_SHEETURL?: string;
  }
}

declare let process: {
  env: Record<string, string | undefined>;
};

@Injectable({
  providedIn: 'root',
})
export class GuestService {
  private apiUrl = environment.apiUrl;
  private sheetUrl = window.NG_APP_SHEETURL || process.env['NG_APP_SHEETURL'] || null;

  // Master signal for all guests in the app
  guests = signal<Guest[]>([]);

  private http = inject(HttpClient);
  private settingsService = inject(SettingsService);
  private tableService = inject(TableService);

  // Método público para cargar invitados
  async loadGuests(): Promise<Guest[]> {
    try {
      const response = await firstValueFrom(this.http.get<unknown>(this.apiUrl));

      let list: unknown[] = [];

      if (Array.isArray(response)) {
        list = response as unknown[];
      } else if (response && typeof response === 'object') {
        const respObj = response as Record<string, unknown>;
        list =
          (respObj['data'] as unknown[]) ||
          (respObj['guests'] as unknown[]) ||
          (respObj['items'] as unknown[]) ||
          (respObj['rows'] as unknown[]) ||
          (respObj['list'] as unknown[]) ||
          [];

        if ((!list || !Array.isArray(list)) && typeof respObj === 'object') {
          const firstArrayKey = Object.keys(respObj).find((key) =>
            Array.isArray(respObj[key] as unknown),
          );
          if (firstArrayKey) {
            list = respObj[firstArrayKey] as unknown[];
          }
        }
      }

      const finalItems: Guest[] = (Array.isArray(list) ? list : []).map((rawItem) => {
        const raw = rawItem as Record<string, unknown>;

        const rawId = raw['_id'] ?? raw['id'];
        const id = rawId !== undefined ? String(rawId) : undefined;

        const tableRaw = raw['tableId'] ?? raw['table_id'] ?? raw['tableName'] ?? raw['table_name'];
        let tableId: number | null = null;
        if (tableRaw !== undefined && tableRaw !== null) {
          const parsed = Number(tableRaw as unknown);
          tableId = !isNaN(parsed) && parsed !== 0 ? parsed : null;
        }

        const seatRaw = raw['seatNumber'] ?? raw['seat_number'];
        const seatNumber =
          seatRaw !== undefined && seatRaw !== null ? Number(seatRaw as unknown) : null;

        const needsTransportRaw =
          raw['needsTransport'] ?? raw['needs_transport'] ?? raw['needTransport'];
        const needsTransport =
          needsTransportRaw === true ||
          needsTransportRaw === 'true' ||
          needsTransportRaw === '1' ||
          needsTransportRaw === 1;

        return {
          id,
          name: (raw['name'] as string) || '',
          email: (raw['email'] as string) || '',
          phone: (raw['phone'] as string) || '',
          attending: Number(raw['attending'] ?? 0),
          attendance:
            typeof raw['attendance'] === 'boolean' ? (raw['attendance'] as boolean) : undefined,
          adults: raw['adults'] !== undefined ? Number(raw['adults']) : undefined,
          children: raw['children'] !== undefined ? Number(raw['children']) : undefined,
          isAdult: raw['isAdult'] !== undefined ? Number(raw['isAdult']) : undefined,
          mealType: (raw['mealType'] as string) || (raw['meal_type'] as string) || '',
          needsTransport,
          isSavedInBbdd: Boolean(raw['isSavedInBbdd'] ?? false),
          sendEmail: raw['sendEmail'] as boolean | undefined,
          tableId,
          tableName: (raw['tableName'] as string) || (raw['table_name'] as string) || undefined,
          seatNumber,
          allergies: raw['allergies'] as string | undefined,
          notes: raw['notes'] as string | undefined,
        };
      });

      this.guests.set(finalItems);
      return finalItems;
    } catch (error) {
      console.error('Error in loadGuests:', error);
      return [];
    }
  }

  // Registra un invitado y recarga el recurso de lista
  async registerGuest(guest: Guest, tenantSlug?: string): Promise<ApiResponse<GuestEntity> | GuestEntity | null> {
    try {
      // Actualización optimista
      // Si sólo se ha indicado si es adulto/niño (flujo interno), derivamos adults/children
      if (
        guest.isAdult !== undefined &&
        guest.adults === undefined &&
        guest.children === undefined
      ) {
        if (guest.isAdult) {
          guest.adults = 1;
          guest.children = 0;
        } else {
          guest.adults = 0;
          guest.children = 1;
        }
      }

      if (guest.attendance === false) {
        guest.attending = 0;
        guest.adults = 0;
        guest.children = 0;
      } else if (guest.adults !== undefined || guest.children !== undefined) {
        // Flujo del formulario público: se calcula a partir de adultos + niños
        const adults = Number(guest.adults || 0);
        const children = Number(guest.children || 0);
        guest.attending = adults + children;
      } else {
        // Flujo interno (ej. creación desde mesas): si no hay conteo, asumimos 1 asistente
        guest.attending = guest.attending ?? 1;
      }
      this.guests.update((current: Guest[]) => [...current, guest]);

      const url = tenantSlug ? `${this.apiUrl}/public/${tenantSlug}` : this.apiUrl;
      const response = await firstValueFrom(
        this.http.post<ApiResponse<GuestEntity>>(url, guest),
      );

      // La respuesta tiene formato { success: true, data: { id: 75, ... }, message: "..." }
      // Necesitamos extraer data.id para actualizar el guest local
      const responseData = response as ApiResponse<GuestEntity>;
      if (responseData && responseData.data && responseData.data.id) {
        // Actualizar el guest con el nuevo ID (coerce a string)
        const guestWithId = { ...guest, id: String(responseData.data.id) };
        this.guests.update((current: Guest[]) =>
          current.map((g) =>
            g.name === guest.name && g.email === guest.email && g.phone === guest.phone
              ? guestWithId
              : g,
          ),
        );
      }

      guest.isSavedInBbdd = true;

      // Enviar también a Google Sheets como backup (JSONP para evitar CORS)
      this.addToGoogleSheetsJsonp(guest, tenantSlug).catch((error) => {
        console.warn('Error adding to Google Sheets backup (JSONP):', error);
      });
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#be185d', '#ec4899', '#f472b6', '#ffffff'],
      });

      return responseData;
    } catch (error) {
      console.error('Error registering guest:', error);
      // Si falla el servidor, intentar guardar en Google Sheets vía JSONP
      try {
        await this.addToGoogleSheetsJsonp(guest, tenantSlug);
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#be185d', '#ec4899', '#f472b6', '#ffffff'],
        });
        // Return null since JSONP backup does not conform to ApiResponse shape
        return null;
      } catch (sheetError) {
        console.error('Error registering guest (both servers failed):', sheetError);
        throw error;
      }
    }
  }

  // Fallback usando JSONP (evita problemas CORS). Usa GET y un callback global.
  private addToGoogleSheetsJsonp(guest: Guest, slug?: string): Promise<Record<string, unknown>> {
    const base = this.sheetUrl;
    if (!base) {
      return Promise.reject(new Error('Google Sheets URL not configured'));
    }
    return new Promise((resolve, reject) => {
      const callbackName = 'gs_cb_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
      const jsonpWindow = window as unknown as JsonpCallbackWindow;

      jsonpWindow[callbackName] = (data: Record<string, unknown>) => {
        cleanup();
        resolve(data);
      };

      const params = new URLSearchParams();
      params.set('name', guest.name || '');
      params.set('email', guest.email || '');
      params.set('phone', guest.phone || '');
      params.set('attending', String(guest.attending ?? ''));
      params.set('adults', String(guest.adults ?? '0'));
      params.set('children', String(guest.children ?? '0'));
      params.set('mealType', guest.mealType || '');
      params.set('needsTransport', String(guest.needsTransport ?? ''));
      params.set('isSavedInBbdd', String(guest.isSavedInBbdd ?? ''));
      params.set('allergies', guest.allergies || '');
      params.set('notes', guest.notes || '');
      params.set('slug', slug || '');
      params.set('callback', callbackName);

      const script = document.createElement('script');
      script.src = base + '?' + params.toString();
      script.onerror = () => {
        cleanup();
        reject(new Error('JSONP script error'));
      };
      document.head.appendChild(script);

      function cleanup() {
        try {
          delete jsonpWindow[callbackName];
        } catch {
          // ignore cleanup error
        }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
    });
  }

  // Obtiene la lista actual desde la API (no desde la cache)
  async getAllGuests(): Promise<Guest[]> {
    // Delegate to loadGuests which already normalizes and coerces IDs
    return this.loadGuests();
  }

  // Devuelve el valor cacheado del recurso (si ya fue cargado)
  getCachedGuests(): Guest[] {
    return this.guests();
  }

  async updateGuest(
    guestId: string | number,
    guestData: Partial<Guest>,
  ): Promise<ApiResponse<GuestEntity>> {
    // Optimístico
    this.guests.update((current: Guest[]) =>
      current.map((g) => (g.id === guestId ? { ...g, ...guestData } : g)),
    );

    const res = await firstValueFrom(
      this.http.patch<ApiResponse<GuestEntity>>(`${this.apiUrl}/${guestId}`, guestData),
    );
    if (res.updatedTables) {
      this.tableService.updateTablesFromMap(res.updatedTables);
    }
    return res;
  }

  async updateGuestTable(
    guestId: string | number,
    tableId: number | null,
    seatNumber: number | null = null,
  ): Promise<ApiResponse<GuestEntity>> {
    if (!guestId) return Promise.reject('No guest ID provided');

    // Normalizar: 0 debe ser null
    const normalizedTableId =
      tableId === 0 || tableId === null || tableId === undefined ? null : tableId;
    const normalizedSeatNumber =
      seatNumber === 0 || seatNumber === null || seatNumber === undefined ? null : seatNumber;

    // Optimístico
    this.guests.update((current: Guest[]) =>
      current.map((g) =>
        g.id === guestId || g.email === guestId || g.phone === guestId
          ? { ...g, tableId: normalizedTableId, seatNumber: normalizedSeatNumber }
          : g,
      ),
    );

    // Enviamos solo los campos especificados por el usuario (camelCase)
    // tableId y seatNumber
    const res = await firstValueFrom(
      this.http.patch<ApiResponse<GuestEntity>>(`${this.apiUrl}/${guestId}`, {
        tableId: normalizedTableId,
        seatNumber: normalizedSeatNumber,
      }),
    );
    if (res.updatedTables) {
      this.tableService.updateTablesFromMap(res.updatedTables);
    }
    return res;
  }

  async deleteGuest(
    guestId: string | number,
  ): Promise<ApiResponse<{ deletedId: number; changes: number }>> {
    // Optimístico
    this.guests.update((current: Guest[]) => current.filter((g) => g.id !== guestId));
    return firstValueFrom(
      this.http.delete<ApiResponse<{ deletedId: number; changes: number }>>(
        `${this.apiUrl}/${guestId}`,
      ),
    );
  }

  async requestDeleteCode(): Promise<ApiResponse<{ success: true }>> {
    // Triggers an email with a code for confirmation
    return firstValueFrom(
      this.http.post<ApiResponse<{ success: true }>>(`${this.apiUrl}/request-delete`, {}),
    );
  }

  async deleteAllGuests(
    code?: string,
  ): Promise<ApiResponse<{ deletedAll: boolean; resetSeq: boolean }>> {
    this.guests.set([]);
    let url = this.apiUrl;
    if (code) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}code=${encodeURIComponent(code)}`;
    }
    return firstValueFrom(
      this.http.delete<ApiResponse<{ deletedAll: boolean; resetSeq: boolean }>>(url),
    );
  }
}
