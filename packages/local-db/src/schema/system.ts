import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Staff. PINs are hashed — a till PIN is a credential, and staff reuse PINs
 * as bank card PINs more often than anyone would like.
 */
export const staff = sqliteTable('staff', {
  id: text('id').primaryKey(),
  locationId: text('location_id').notNull(),
  name: text('name').notNull(),
  /** Argon2id. Never store or log the PIN itself. */
  pinHash: text('pin_hash').notNull(),
  role: text('role', { enum: ['server', 'supervisor', 'manager', 'admin'] })
    .notNull()
    .default('server'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  updatedAt: text('updated_at').notNull(),
});

/**
 * THE OUTBOX. Every local write bound for the cloud also lands here.
 * A background worker drains it when online and retries with backoff.
 * See ADR-004 — delivery is at-least-once, so the cloud dedupes on entityId.
 */
export const syncQueue = sqliteTable(
  'sync_queue',
  {
    id: text('id').primaryKey(),
    entity: text('entity', {
      enum: ['order_event', 'payment', 'stock_movement', 'shift'],
    }).notNull(),
    /** UUID of the record being synced — the cloud's idempotency key. */
    entityId: text('entity_id').notNull(),
    payload: text('payload').notNull(), // JSON

    status: text('status', { enum: ['pending', 'in_flight', 'synced', 'failed'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    /** Exponential backoff target; the worker skips rows until this passes. */
    nextAttemptAt: text('next_attempt_at'),

    createdAt: text('created_at').notNull(),
    syncedAt: text('synced_at'),
  },
  (t) => [
    // The worker's hot query: pending rows whose backoff has elapsed, oldest first.
    index('idx_sync_queue_drain').on(t.status, t.nextAttemptAt),
    index('idx_sync_queue_entity').on(t.entity, t.entityId),
  ],
);

/**
 * Single-row-per-key device state. Holds the device identity, the monotonic
 * event sequence counter (ADR-003), and pull cursors for downward sync.
 */
export const deviceState = sqliteTable('device_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** Inventory — eventually consistent; central reconciles and flags negatives. */
export const inventoryItems = sqliteTable('inventory_items', {
  id: text('id').primaryKey(),
  locationId: text('location_id').notNull(),
  name: text('name').notNull(),
  unit: text('unit').notNull(), // 'each' | 'kg' | 'litre'
  /** Thousandths of a unit, to keep integers in the stock path too. */
  quantityMilli: integer('quantity_milli').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: text('id').primaryKey(),
    inventoryItemId: text('inventory_item_id')
      .notNull()
      .references(() => inventoryItems.id),
    /** Signed: negative for sale/waste, positive for delivery. */
    deltaMilli: integer('delta_milli').notNull(),
    reason: text('reason', {
      enum: ['sale', 'waste', 'delivery', 'stock_take', 'transfer'],
    }).notNull(),
    /** Order that caused it, when reason = 'sale'. */
    orderId: text('order_id'),
    staffId: text('staff_id'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_stock_movements_item').on(t.inventoryItemId)],
);
