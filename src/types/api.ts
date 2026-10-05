// Types generated from API_TYPES.md

export interface ApiResponse<T> {
  success: boolean;
  data?: T | undefined;
  message?: string | undefined;
  error?: string | undefined;
  details?: string | undefined;
  count?: number | undefined;
  code?: string | undefined;
  updatedTables?: Record<string, TableEntity> | undefined;
}

export type BooleanFlag = boolean | 0 | 1;

export interface GuestEntity {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  attending: BooleanFlag;
  mealType: string;
  needsTransport: BooleanFlag;
  allergies: string | null;
  notes: string | null;
  tableId: number | null;
  isAdult: BooleanFlag;
  seatNumber: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GuestCreateRequest {
  name: string;
  email?: string;
  phone?: string;
  adults?: number;
  children?: number;
  attendance?: boolean;
  mealType?: string;
  needsTransport?: boolean;
  allergies?: string;
  notes?: string;
  sendEmail?: boolean;
  isAdult?: boolean;
}

export interface GuestUpdateRequest {
  name: string;
  email?: string;
  phone?: string;
  attending?: boolean;
  mealType?: string;
  needsTransport?: boolean;
  allergies?: string;
  notes?: string;
  tableId?: number | null;
  seatNumber?: number | null;
}

export type GuestPatchRequest = Partial<{
  name: string;
  email: string | null;
  phone: string | null;
  attending: boolean;
  mealType: string;
  needsTransport: boolean;
  allergies: string | null;
  notes: string | null;
  tableId: number | null;
  seatNumber: number | null;
}>;

export interface GuestFilters {
  attending?: boolean;
  needsTransport?: boolean;
  search?: string;
}

export interface ContactEntity {
  id: number;
  name: string;
  phone: string;
  side: string;
  countryCode: string;
  linkSent: 0 | 1;
  invitationStatus: string;
  sentAt?: string | null;
  respondedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContactCreateRequest {
  name: string;
  phone: string;
  side: string;
  countryCode?: string;
}

export type ContactPatchRequest = Partial<{
  name: string;
  phone: string;
  side: string;
  countryCode: string;
  linkSent: boolean;
  sentAt: string | null;
  invitationStatus: string;
  respondedAt: string | null;
}>;

export interface ContactFilters {
  side?: string;
  linkSent?: boolean;
}

export interface FinanceEntity {
  id: number;
  description: string;
  amount: number;
  type: string;
  category?: string | null;
  date?: string | null;
  paidBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface FinanceCreateRequest {
  description: string;
  amount: number;
  type: string;
  category?: string;
  date?: string;
  paidBy?: string;
}

export interface FinanceUpdateRequest {
  description?: string;
  amount?: number;
  type?: string;
  category?: string | null;
  date?: string | null;
  paidBy?: string | null;
}

export interface TableEntity {
  id: number;
  name: string;
  capacity: number;
  shape: string;
  posX: number;
  posY: number;
  captainIds?: number[] | null;
  rotation?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TableCreateRequest {
  name?: string;
  capacity?: number;
  shape?: string;
  posX?: number;
  posY?: number;
}

export interface TableUpdateRequest {
  name?: string;
  capacity?: number;
  shape?: string;
  posX?: number;
  posY?: number;
  captainId?: number | null;
  captainIds?: number[] | null;
  rotation?: number;
}

export interface TodoEntity {
  id: number;
  name: string;
  status: string;
  date?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TodoCreateRequest {
  name: string;
  status?: string;
  date?: string;
}

export interface TodoUpdateRequest {
  name: string;
  status: string;
  date?: string | null;
}

export type TodoPatchRequest = Partial<{
  name: string;
  status: string;
  date: string | null;
}>;

export interface CategoryEntity {
  id: number;
  name: string;
  slug: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CategoryCreateRequest {
  name: string;
  slug: string;
}

export interface SettingItem {
  key: string;
  value: string | boolean | number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SettingUpdateRequest {
  value: string;
}

export interface MusicPlaylistSong {
  id: number;
  title: string;
  artist: string;
  youtube_url: string;
  youtube_id: string;
  note?: string | null;
  order_index: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface MusicPlaylistCreateRequest {
  title: string;
  artist: string;
  youtube_url: string;
  youtube_id?: string;
  note?: string;
  order_index?: number;
}

export type MusicPlaylistPatchRequest = Partial<{
  title: string;
  artist: string;
  youtube_url: string;
  youtube_id: string;
  note: string | null;
  order_index: number;
}>;

export interface MusicPlaylistReorderRequest {
  songs: { id: number; order: number }[];
}

export interface AuthLoginRequest {
  username: string;
  password: string;
}

export interface AuthRegisterRequest {
  username: string;
  email: string;
  password: string;
  estimatedGuests?: number | null;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string | null;
  role: string;
  slug: string;
  /**
   * `null` hasta que el webhook de Stripe confirma el pago. El
   * frontend puede actualizarlo optimistamente tras un pago
   * exitoso (ver `AuthService.markAsPaid()`).
   */
  paidAt: string | null;
}

export interface AuthLoginResponse {
  success: boolean;
  token: string;
  user: AuthUser;
}

export interface CheckUsernameResponse {
  success: boolean;
  available: boolean;
  message?: string;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string | null;
  role: string;
  slug: string;
  paidAt: string | null;
  paid: boolean;
  invitationCompletedAt: string | null;
  hasInvitation: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  guestCount: number;
  contactCount: number;
  tableCount: number;
  financeCount: number;
  todoCount: number;
  notes: string | null;
  isProtected: boolean;
}

export type AdminUserPatch = Partial<{
  email: string | null;
  paidAt: string | null;
  invitationCompletedAt: string | null;
  notes: string | null;
}>;

export interface AuthRegisterResponse {
  success: boolean;
  token: string;
  user: AuthUser;
}

/**
 * Cuestionario inicial que el cliente rellena justo después de
 * registrarse para que el admin sepa qué tipo de landing quiere.
 *
 * Los booleanos llegan como `0 | 1` por la convención del backend
 * (mismo patrón que `BooleanFlag`); en la UI se convierten a `boolean`.
 */
export interface LandingQuestionnaire {
  id: number;
  userId: number;
  weddingDate: string | null;
  estimatedGuests: number | null;
  predominantColor: string | null;
  hasCountdown: 0 | 1;
  hasBusService: 0 | 1;
  hasHotelService: 0 | 1;
  hasCoverPhoto: 0 | 1;
  hasOurStory: 0 | 1;
  hasGallery: 0 | 1;
  hasAddToCalendar: 0 | 1;
  hasVenueMap: 0 | 1;
  hasGiftRegistry: 0 | 1;
  giftBankAccount: string | null;
  hasBackgroundMusic: 0 | 1;
  backgroundMusicSong: string | null;
  /**
   * Entradas de "Nuestra historia": cada una es un par `{ url, caption }`
   * serializado en una sola columna TEXT como JSON array. La `url` apunta
   * a la imagen subida en /api/invitation-media/gallery y `caption` es
   * el texto descriptivo que el cliente escribió para esa foto. Si el
   * cliente desactivó la historia o no subió nada, queda `null`.
   */
  ourStoryEntries: string | null;
  /**
   * LEGACY: columna vieja que solo guardaba los captions como JSON array
   * de strings (sin URL). Se sigue leyendo para no perder los registros
   * que se guardaron con el formato anterior; el frontend lo muestra
   * como fallback con un aviso de "foto no asociada".
   */
  ourStoryCaptions?: string | null;
  contactCouple: 0 | 1;
  contactGroomPhone: string | null;
  contactBridePhone: string | null;
  additionalServices: string | null;
  notes: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type LandingQuestionnairePatch = Partial<{
  weddingDate: string | null;
  estimatedGuests: number | null;
  predominantColor: string | null;
  hasCountdown: boolean;
  hasBusService: boolean;
  hasHotelService: boolean;
  hasCoverPhoto: boolean;
  hasOurStory: boolean;
  hasGallery: boolean;
  hasAddToCalendar: boolean;
  hasVenueMap: boolean;
  hasGiftRegistry: boolean;
  giftBankAccount: string | null;
  hasBackgroundMusic: boolean;
  backgroundMusicSong: string | null;
  /**
   * Entradas `{ url, caption }[]` para "Nuestra historia", serializadas
   * como JSON string en una sola columna. Cada entry vincula una URL
   * de foto subida con su caption correspondiente.
   */
  ourStoryEntries: string | null;
  contactCouple: boolean;
  contactGroomPhone: string | null;
  contactBridePhone: string | null;
  additionalServices: string | null;
  notes: string | null;
}>;

export interface AiGenerateRequest {
  type:
    | 'absence_reason'
    | 'attendance_note'
    | 'attendance_full'
    | 'song_request'
    | 'invitation_text';
  guestName: string;
  songHint?: string;
  stream?: boolean;
}

/**
 * Respuesta de `GET /api/payments/config`. Permite al frontend saber
 * si el modo demo sigue activo o si debe mostrar el checkout real de
 * Stripe. La publishable key está diseñada para vivir en el navegador.
 */
export interface PaymentConfig {
  enabled: boolean;
  publishableKey: string | null;
  amount: number;
  currency: string;
  description: string;
}

/**
 * Respuesta de `POST /api/payments/create-intent`. El frontend usa
 * `clientSecret` para inicializar el Payment Element de Stripe y
 * `paymentIntentId` para correlación/logs.
 *
 * Tras añadir el soporte de códigos de descuento, el backend puede
 * responder con `valid: false` cuando el usuario mandó un código
 * que no es válido (es un input esperado, NO un error de transporte).
 * En ese caso faltan `clientSecret` y `paymentIntentId` y el caller
 * debe mostrar el `message`.
 */
export interface PaymentIntentResponse {
  clientSecret?: string;
  paymentIntentId?: string;
  amount?: number;
  currency?: string;
  reused?: boolean;
  valid?: boolean;
  reason?: 'not_found' | 'inactive' | 'expired' | 'empty';
  message?: string;
  originalAmountCents?: number;
  discount?: AppliedDiscount | null;
}

/**
 * Subset de campos del descuento aplicado que el frontend renderiza
 * junto al resumen de pago (precio original tachado, ahorro, final).
 *
 * Todos los importes en CÉNTIMOS para evitar redondeos; la UI los
 * formatea a euros en su locale (`es-ES`).
 */
export interface AppliedDiscount {
  code: string;
  percent: number;
  originalAmountCents: number;
  savingsCents: number;
  finalAmountCents: number;
  description?: string | null;
  expiresAt?: string | null;
}

/**
 * Respuesta de `POST /api/payments/validate-discount`. Devuelve
 * siempre 200 (un cupón inválido NO es un error). El caller distingue
 * con la propiedad `valid`.
 */
export interface DiscountValidationResponse {
  success: true;
  valid: boolean;
  reason?: 'not_found' | 'inactive' | 'expired' | 'empty';
  message?: string;
  code?: string;
  percent?: number;
  description?: string | null;
  expiresAt?: string | null;
  currency?: string;
  originalAmountCents?: number;
  savingsCents?: number;
  finalAmountCents?: number;
}

/**
 * Respuesta de `POST /api/payments/create-checkout-session`. El frontend
 * usa `url` para redirigir al cliente a la página hosted de Stripe con
 * `window.location.href`. `sessionId` se devuelve también para
 * correlación/logs (es el `cs_test_...` / `cs_live_...`).
 */
export interface CheckoutSessionResponse {
  url: string;
  sessionId: string;
}

/**
 * Historial de pagos devuelto por `GET /api/payments/me`. El frontend
 * lo usa para mostrar el estado del pago (succeeded/processing/failed)
 * y permitir reintentos si el webhook aún no ha llegado.
 */
export interface PaymentRecord {
  id: number;
  userId: number;
  stripePaymentIntentId: string;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentsListResponse {
  paid: boolean;
  paidAt: string | null;
  payments: PaymentRecord[];
}

export interface AiGenerateResponse {
  success: boolean;
  data?: {
    text: string;
  };
  error?: string;
}

export interface ConfirmationCodeQuery {
  code: string;
}

/**
 * Cupón de descuento devuelto por `GET /api/admin/discount-codes`.
 *
 * Los códigos son **globales** (no se vinculan a un usuario concreto)
 * y los gestiona únicamente el admin desde el panel.
 *
 *  - `active`: el backend lo serializa como `0 | 1` por la convención
 *    de SQLite. En la UI lo convertimos a `boolean` para que el
 *    template use `@if (code.active)` sin sorpresas.
 *  - `expiresAt`: ISO datetime o `null` si no expira. El backend
 *    compara contra `Date.now()` en cada validación.
 */
export interface DiscountCode {
  id: number;
  code: string;
  percent: number;
  active: 0 | 1 | boolean;
  description: string | null;
  expiresAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Payload para `POST /api/admin/discount-codes`. El backend normaliza
 * `code` (trim + uppercase) y aplica la regex `[A-Z0-9_-]{2,40}`;
 * el frontend hace las mismas validaciones para no enviar formularios
 * inválidos que sabemos que van a fallar.
 */
export interface DiscountCodeCreateRequest {
  code: string;
  percent: number;
  description?: string | null;
  expiresAt?: string | null;
}

/**
 * Payload para `PATCH /api/admin/discount-codes/:id`. Todos los
 * campos son opcionales — solo se aplican los enviados. Se usa
 * para activar/desactivar un código sin re-crearlo.
 */
export type DiscountCodePatchRequest = Partial<{
  percent: number;
  active: boolean;
  description: string | null;
  expiresAt: string | null;
}>;
