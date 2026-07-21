import type Database from 'better-sqlite3';

/**
 * Cash-drawer shift session (screen 1.12). A shift opens with a float and closes
 * with a physical count; the Z-report variance is `counted - expected`.
 */

export interface ShiftRow {
  id: string;
  locationId: string;
  deviceId: string;
  businessDate: string;
  openingFloatP: number;
  status: 'open' | 'closed';
  countedCashP: number | null;
  expectedCashP: number | null;
  varianceP: number | null;
  openedAt: string;
  closedAt: string | null;
}

const SELECT =
  `SELECT id, location_id AS locationId, device_id AS deviceId, business_date AS businessDate,
          opening_float_p AS openingFloatP, status, counted_cash_p AS countedCashP,
          expected_cash_p AS expectedCashP, variance_p AS varianceP,
          opened_at AS openedAt, closed_at AS closedAt
   FROM shifts`;

export function getOpenShift(sqlite: Database.Database, deviceId: string): ShiftRow | undefined {
  return sqlite
    .prepare(`${SELECT} WHERE device_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`)
    .get(deviceId) as ShiftRow | undefined;
}

export function getShift(sqlite: Database.Database, id: string): ShiftRow | undefined {
  return sqlite.prepare(`${SELECT} WHERE id = ?`).get(id) as ShiftRow | undefined;
}

export interface OpenShiftInput {
  id: string;
  locationId: string;
  deviceId: string;
  businessDate: string;
  openedByStaffId: string;
  openingFloatP: number;
  now: string;
}

export function openShift(sqlite: Database.Database, input: OpenShiftInput): ShiftRow {
  sqlite
    .prepare(
      `INSERT INTO shifts (id, location_id, device_id, business_date, opened_by_staff_id, opened_at, opening_float_p, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    )
    .run(
      input.id,
      input.locationId,
      input.deviceId,
      input.businessDate,
      input.openedByStaffId,
      input.now,
      input.openingFloatP,
    );
  return getShift(sqlite, input.id)!;
}

export interface CloseShiftInput {
  shiftId: string;
  closedByStaffId: string;
  countedCashP: number;
  expectedCashP: number;
  now: string;
}

export function closeShift(sqlite: Database.Database, input: CloseShiftInput): ShiftRow | undefined {
  const variance = input.countedCashP - input.expectedCashP;
  sqlite
    .prepare(
      `UPDATE shifts
         SET closed_by_staff_id = ?, closed_at = ?, counted_cash_p = ?, expected_cash_p = ?,
             variance_p = ?, status = 'closed'
       WHERE id = ? AND status = 'open'`,
    )
    .run(
      input.closedByStaffId,
      input.now,
      input.countedCashP,
      input.expectedCashP,
      variance,
      input.shiftId,
    );
  return getShift(sqlite, input.shiftId);
}
