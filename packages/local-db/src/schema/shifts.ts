import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * A shift is one cash drawer session: opened with a float, closed with a
 * count. This is the basis of X-reports (mid-shift read) and Z-reports
 * (end-of-day close), which are core restaurant ops and an HMRC-facing record.
 */
export const shifts = sqliteTable(
  'shifts',
  {
    id: text('id').primaryKey(), // UUIDv4
    locationId: text('location_id').notNull(),
    deviceId: text('device_id').notNull(),
    businessDate: text('business_date').notNull(), // trading day

    openedByStaffId: text('opened_by_staff_id').notNull(),
    openedAt: text('opened_at').notNull(),
    /** Starting cash in the drawer. Integer pence. */
    openingFloatP: integer('opening_float_p').notNull(),

    closedByStaffId: text('closed_by_staff_id'),
    closedAt: text('closed_at'),
    /** What staff physically counted at close. */
    countedCashP: integer('counted_cash_p'),
    /**
     * What the system says should be there: float + cash sales - refunds
     * - payouts. Computed at close.
     */
    expectedCashP: integer('expected_cash_p'),
    /** counted - expected. Negative means the drawer is down. */
    varianceP: integer('variance_p'),

    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    notes: text('notes'),
  },
  (t) => [
    index('idx_shifts_status').on(t.status),
    index('idx_shifts_business_date').on(t.locationId, t.businessDate),
  ],
);

/**
 * Non-sale cash drawer movements: paid-outs (window cleaner), paid-ins,
 * safe drops. These must be captured or the Z-report never balances.
 */
export const cashMovements = sqliteTable(
  'cash_movements',
  {
    id: text('id').primaryKey(),
    shiftId: text('shift_id')
      .notNull()
      .references(() => shifts.id),
    type: text('type', { enum: ['pay_in', 'pay_out', 'safe_drop'] }).notNull(),
    /** Always positive; `type` carries the direction. */
    amountP: integer('amount_p').notNull(),
    reason: text('reason').notNull(),
    staffId: text('staff_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_cash_movements_shift').on(t.shiftId)],
);
