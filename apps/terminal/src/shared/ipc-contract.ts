/**
 * The typed contract between the Electron main process and the renderer.
 *
 * This is the ONLY way the UI reaches the database (ADR-005). Keep the surface
 * domain-shaped and narrow — `orders.addItem`, never `db.query`. A generic
 * query channel would hand the renderer arbitrary SQL and defeat the point of
 * context isolation.
 *
 * Imported by main, preload and renderer, so it must stay free of Node and DOM
 * imports.
 */

export const IPC = {
  DB_STATUS: 'db:status',
  APP_INFO: 'app:info',
  AUTH_LIST_STAFF: 'auth:listStaff',
  AUTH_VERIFY_PIN: 'auth:verifyPin',
  CLOCK_PUNCH: 'clock:punch',
  TABLES_LIST: 'tables:list',
  TABLE_SET_STATUS: 'tables:setStatus',
  AUTH_AUTHORIZE_OVERRIDE: 'auth:authorizeOverride',
  SHIFT_GET_OR_OPEN: 'shift:getOrOpen',
  SHIFT_CLOSE: 'shift:close',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

export type StaffRole = 'server' | 'supervisor' | 'manager' | 'admin';

export interface StaffSummary {
  id: string;
  name: string;
  role: StaffRole;
}

/**
 * Result of a PIN check. The hash never crosses this boundary — the renderer
 * learns only whether the PIN was right, and how close the account is to (or
 * how long it is in) a lockout.
 */
export type VerifyPinResult =
  | { ok: true; staff: StaffSummary }
  | { ok: false; lockedOut: true; secondsRemaining: number }
  | { ok: false; lockedOut: false; attemptsRemaining: number };

export type ClockDirection = 'in' | 'out';

/** Permissions a manager PIN can authorise from the till floor. */
export type OverridePermission =
  | 'order.discount'
  | 'order.void_item_before_payment'
  | 'order.void_item_after_payment'
  | 'payment.refund';

/** Result of a manager-override PIN check — a wrong or unauthorised PIN is `ok:false`. */
export type OverrideResult = { ok: true; staff: StaffSummary } | { ok: false };

export interface ShiftInfo {
  id: string;
  businessDate: string;
  openingFloatP: number;
  status: 'open' | 'closed';
  countedCashP: number | null;
  expectedCashP: number | null;
  varianceP: number | null;
  openedAt: string;
  closedAt: string | null;
}

export type TableStatus = 'available' | 'occupied' | 'bill_requested' | 'needs_clean';
export type TableShape = 'round' | 'square';

export interface TableInfo {
  id: string;
  area: string;
  number: string;
  seats: number;
  shape: TableShape;
  posX: number;
  posY: number;
  status: TableStatus;
  covers: number;
  seatedAt: string | null;
}

export interface DbStatus {
  ready: boolean;
  schemaVersion: number;
  path: string | null;
  tableCount: number;
}

export interface AppInfo {
  version: string;
  electron: string;
  node: string;
}

/** Shape exposed on `window.pos` by the preload script. */
export interface PosBridge {
  getDbStatus(): Promise<DbStatus>;
  getAppInfo(): Promise<AppInfo>;
  /** Roster for the login screen — no secrets, safe for the renderer. */
  listStaff(): Promise<StaffSummary[]>;
  /** PIN check happens in main; the hash never reaches the renderer. */
  verifyPin(staffId: string, pin: string): Promise<VerifyPinResult>;
  /** Clock a staff member in or out at login. */
  punchClock(staffId: string, direction: ClockDirection): Promise<{ ok: true }>;
  /** Floor plan (1.3). */
  listTables(): Promise<TableInfo[]>;
  setTableStatus(tableId: string, status: TableStatus): Promise<TableInfo | null>;
  /** Manager override (1.9): checks a PIN against any staff member who holds the
   *  permission. The hash never reaches the renderer. */
  authorizeOverride(permission: OverridePermission, pin: string): Promise<OverrideResult>;
  /** Cash-up (1.12): the current open shift, opening one with `openingFloatP` if none. */
  getOrOpenShift(openingFloatP: number): Promise<ShiftInfo>;
  closeShift(shiftId: string, countedCashP: number, expectedCashP: number): Promise<ShiftInfo | null>;
}
