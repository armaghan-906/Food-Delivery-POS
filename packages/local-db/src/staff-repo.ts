import type Database from 'better-sqlite3';

/**
 * Read helpers for the staff table, used by the till's login flow.
 *
 * The roster (`listActiveStaff`) is safe to hand to the renderer. The auth row
 * (`getStaffAuth`) carries the PIN hash and must NEVER leave the main process —
 * the renderer only ever receives a yes/no from a PIN check done here.
 */

export type StaffRole = 'server' | 'supervisor' | 'manager' | 'admin';

export interface StaffSummary {
  id: string;
  name: string;
  role: StaffRole;
}

export interface StaffAuthRow extends StaffSummary {
  pinHash: string;
}

export function listActiveStaff(sqlite: Database.Database): StaffSummary[] {
  return sqlite
    .prepare('SELECT id, name, role FROM staff WHERE is_active = 1 ORDER BY name')
    .all() as StaffSummary[];
}

export function getStaffAuth(sqlite: Database.Database, id: string): StaffAuthRow | undefined {
  return sqlite
    .prepare(
      'SELECT id, name, role, pin_hash AS pinHash FROM staff WHERE id = ? AND is_active = 1',
    )
    .get(id) as StaffAuthRow | undefined;
}
