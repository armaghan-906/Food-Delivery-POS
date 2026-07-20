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
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

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
}
