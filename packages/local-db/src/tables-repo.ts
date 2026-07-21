import type Database from 'better-sqlite3';

/**
 * Floor-plan table state (screen 1.3). The layout is arranged once; status,
 * covers and seated_at change through service and are mutated here.
 */

export type TableStatus = 'available' | 'occupied' | 'bill_requested' | 'needs_clean';
export type TableShape = 'round' | 'square';

export interface TableRow {
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

const SELECT =
  'SELECT id, area, number, seats, shape, pos_x AS posX, pos_y AS posY, status, covers, seated_at AS seatedAt FROM dining_tables';

export function listTables(sqlite: Database.Database): TableRow[] {
  return sqlite.prepare(`${SELECT} ORDER BY area, number`).all() as TableRow[];
}

export function getTable(sqlite: Database.Database, id: string): TableRow | undefined {
  return sqlite.prepare(`${SELECT} WHERE id = ?`).get(id) as TableRow | undefined;
}

/**
 * Update a table's status. Clearing to `available` (e.g. after "Mark as Clean")
 * also releases the covers and the seating clock; occupying stamps seated_at.
 */
export function setTableStatus(
  sqlite: Database.Database,
  id: string,
  status: TableStatus,
  now: string,
): TableRow | undefined {
  if (status === 'available' || status === 'needs_clean') {
    sqlite
      .prepare(
        'UPDATE dining_tables SET status = ?, covers = 0, seated_at = NULL, updated_at = ? WHERE id = ?',
      )
      .run(status, now, id);
  } else {
    // Occupied / bill-requested: keep covers, stamp seated_at if not already seated.
    sqlite
      .prepare(
        `UPDATE dining_tables
           SET status = ?, seated_at = COALESCE(seated_at, ?), updated_at = ?
         WHERE id = ?`,
      )
      .run(status, now, now, id);
  }
  return getTable(sqlite, id);
}
