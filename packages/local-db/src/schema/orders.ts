import { sqliteTable, text, integer, index, unique } from 'drizzle-orm/sqlite-core';
import { locations } from './menu.js';
import { shifts } from './shifts.js';

/**
 * ORDERS ARE A PROJECTION, NOT THE TRUTH.
 *
 * `order_events` is the append-only source of truth. This table is a
 * materialised read model, rebuilt by replaying events, so the order screen
 * and reports can query without folding the log every time.
 *
 * Nothing may write here except the event projector.
 */
export const orders = sqliteTable(
  'orders',
  {
    id: text('id').primaryKey(), // client-generated UUIDv4
    locationId: text('location_id')
      .notNull()
      .references(() => locations.id),
    shiftId: text('shift_id')
      .notNull()
      .references(() => shifts.id),

    /**
     * Human-readable per-site, per-trading-day sequence. Kitchen staff cannot
     * call out a UUID. See ADR-007.
     */
    dailyNumber: integer('daily_number').notNull(),
    /** Trading day (YYYY-MM-DD), which is not the calendar day for late service. */
    businessDate: text('business_date').notNull(),

    channel: text('channel', { enum: ['dine_in', 'takeaway', 'delivery'] }).notNull(),
    status: text('status', {
      enum: ['draft', 'placed', 'paid', 'refunded', 'cancelled'],
    })
      .notNull()
      .default('draft'),

    /** All integer pence. Derived from events — never set directly. */
    subtotalP: integer('subtotal_p').notNull().default(0),
    discountP: integer('discount_p').notNull().default(0),
    serviceChargeP: integer('service_charge_p').notNull().default(0),
    vatP: integer('vat_p').notNull().default(0),
    totalP: integer('total_p').notNull().default(0),

    staffId: text('staff_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    // Two sites can both have order #42 today; the same site cannot.
    unique('uq_order_daily_number').on(t.locationId, t.businessDate, t.dailyNumber),
    index('idx_orders_status').on(t.status),
    index('idx_orders_shift').on(t.shiftId),
  ],
);

/**
 * Line items — also a projection. Each line freezes the price, VAT rate and
 * allergen set that applied at the moment it was added (ADR-002), so a
 * historical order re-renders as it was actually sold.
 */
export const orderLines = sqliteTable(
  'order_lines',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    menuItemId: text('menu_item_id').notNull(),

    /** Name captured at sale time — the menu may be renamed later. */
    name: text('name').notNull(),
    unitPriceP: integer('unit_price_p').notNull(),
    quantity: integer('quantity').notNull().default(1),

    /** Resolved from the order channel at add-time and frozen. */
    vatRateBps: integer('vat_rate_bps').notNull(),

    /** Per-line money, after modifiers and line discounts. */
    lineSubtotalP: integer('line_subtotal_p').notNull(),
    lineDiscountP: integer('line_discount_p').notNull().default(0),
    lineVatP: integer('line_vat_p').notNull(),
    lineTotalP: integer('line_total_p').notNull(),

    /** Selected modifiers, frozen. JSON array of {modifierId,name,priceDeltaP}. */
    modifiersJson: text('modifiers_json').notNull().default('[]'),
    /** Effective allergens (item + modifiers), frozen. JSON AllergenTag[]. */
    allergensJson: text('allergens_json').notNull().default('[]'),

    isVoided: integer('is_voided', { mode: 'boolean' }).notNull().default(false),
    voidReason: text('void_reason'),

    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_order_lines_order').on(t.orderId)],
);

/**
 * THE SOURCE OF TRUTH. Append-only: no UPDATE, no DELETE, ever.
 * Corrections are new events. This is the HMRC audit trail.
 */
export const orderEvents = sqliteTable(
  'order_events',
  {
    id: text('id').primaryKey(), // UUIDv4, doubles as cloud idempotency key
    orderId: text('order_id').notNull(),
    type: text('type').notNull(),
    payload: text('payload').notNull(), // JSON

    deviceId: text('device_id').notNull(),
    /**
     * Per-device monotonic counter. Replay by (deviceId, sequence), NOT by
     * createdAt — till clocks drift and staff change them. See ADR-003.
     */
    sequence: integer('sequence').notNull(),
    /** Till wall-clock. Informational only. */
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    unique('uq_event_device_sequence').on(t.deviceId, t.sequence),
    index('idx_order_events_order').on(t.orderId, t.sequence),
  ],
);

/**
 * Payments. NO RAW CARD DATA — see docs/compliance.md. Only a provider token,
 * last 4, scheme and auth code may ever land here.
 */
export const payments = sqliteTable(
  'payments',
  {
    id: text('id').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.id),
    method: text('method', { enum: ['cash', 'card'] }).notNull(),
    amountP: integer('amount_p').notNull(),

    /** Cash: what the customer handed over. Change is derived, not stored. */
    tenderedP: integer('tendered_p'),

    /** Card (Phase 3): provider transaction reference. NEVER a card number. */
    providerRef: text('provider_ref'),
    cardLast4: text('card_last4'),
    cardScheme: text('card_scheme'),
    authCode: text('auth_code'),

    status: text('status', { enum: ['pending', 'completed', 'failed', 'refunded'] })
      .notNull()
      .default('completed'),

    staffId: text('staff_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_payments_order').on(t.orderId)],
);
