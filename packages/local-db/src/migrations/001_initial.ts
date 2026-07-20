import type { Migration } from '../migrate.js';

/**
 * Phase 1 schema. Mirrors src/schema/*.ts — keep them in step.
 *
 * Money columns are suffixed _p (pence) and are INTEGER. There are no REAL
 * columns anywhere in this schema and there must never be one in the money path.
 */
export const migration001: Migration = {
  version: 1,
  name: 'initial_schema',
  up: `
    -- ---------- Reference data (pulled down from central) ----------

    CREATE TABLE locations (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      address_line1 TEXT NOT NULL,
      address_line2 TEXT,
      city          TEXT NOT NULL,
      postcode      TEXT NOT NULL,
      vat_number    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE categories (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      colour     TEXT,
      is_active  INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE menu_items (
      id                     TEXT PRIMARY KEY,
      category_id            TEXT NOT NULL REFERENCES categories(id),
      name                   TEXT NOT NULL,
      description            TEXT,
      price_p                INTEGER NOT NULL,
      -- VAT depends on item AND channel. See docs/decisions.md ADR-002.
      vat_rate_eat_in_bps    INTEGER NOT NULL DEFAULT 2000,
      vat_rate_takeaway_bps  INTEGER NOT NULL DEFAULT 2000,
      is_hot_food            INTEGER NOT NULL DEFAULT 0,
      sort_order             INTEGER NOT NULL DEFAULT 0,
      is_active              INTEGER NOT NULL DEFAULT 1,
      updated_at             TEXT NOT NULL
    );
    CREATE INDEX idx_menu_items_category ON menu_items(category_id);

    CREATE TABLE modifier_groups (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      min_selections INTEGER NOT NULL DEFAULT 0,
      max_selections INTEGER NOT NULL DEFAULT 1,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      updated_at     TEXT NOT NULL
    );

    CREATE TABLE modifiers (
      id             TEXT PRIMARY KEY,
      group_id       TEXT NOT NULL REFERENCES modifier_groups(id),
      name           TEXT NOT NULL,
      price_delta_p  INTEGER NOT NULL DEFAULT 0,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      is_active      INTEGER NOT NULL DEFAULT 1,
      updated_at     TEXT NOT NULL
    );
    CREATE INDEX idx_modifiers_group ON modifiers(group_id);

    CREATE TABLE menu_item_modifier_groups (
      menu_item_id      TEXT NOT NULL REFERENCES menu_items(id),
      modifier_group_id TEXT NOT NULL REFERENCES modifier_groups(id),
      sort_order        INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (menu_item_id, modifier_group_id)
    );
    CREATE INDEX idx_mimg_item ON menu_item_modifier_groups(menu_item_id);

    -- Natasha's Law. Attaches to items AND modifiers.
    CREATE TABLE allergen_tags (
      id         TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL CHECK (owner_type IN ('menu_item','modifier')),
      owner_id   TEXT NOT NULL,
      allergen   TEXT NOT NULL,
      presence   TEXT NOT NULL DEFAULT 'contains'
                 CHECK (presence IN ('contains','may_contain')),
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_allergen_owner ON allergen_tags(owner_type, owner_id);

    CREATE TABLE staff (
      id          TEXT PRIMARY KEY,
      location_id TEXT NOT NULL,
      name        TEXT NOT NULL,
      pin_hash    TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'server'
                  CHECK (role IN ('server','supervisor','manager','admin')),
      is_active   INTEGER NOT NULL DEFAULT 1,
      updated_at  TEXT NOT NULL
    );

    -- ---------- Shifts / cash drawer ----------

    CREATE TABLE shifts (
      id                  TEXT PRIMARY KEY,
      location_id         TEXT NOT NULL,
      device_id           TEXT NOT NULL,
      business_date       TEXT NOT NULL,
      opened_by_staff_id  TEXT NOT NULL,
      opened_at           TEXT NOT NULL,
      opening_float_p     INTEGER NOT NULL,
      closed_by_staff_id  TEXT,
      closed_at           TEXT,
      counted_cash_p      INTEGER,
      expected_cash_p     INTEGER,
      variance_p          INTEGER,
      status              TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','closed')),
      notes               TEXT
    );
    CREATE INDEX idx_shifts_status ON shifts(status);
    CREATE INDEX idx_shifts_business_date ON shifts(location_id, business_date);

    CREATE TABLE cash_movements (
      id         TEXT PRIMARY KEY,
      shift_id   TEXT NOT NULL REFERENCES shifts(id),
      type       TEXT NOT NULL CHECK (type IN ('pay_in','pay_out','safe_drop')),
      amount_p   INTEGER NOT NULL CHECK (amount_p > 0),
      reason     TEXT NOT NULL,
      staff_id   TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_cash_movements_shift ON cash_movements(shift_id);

    -- ---------- Orders ----------

    -- Projection rebuilt from order_events. Only the projector writes here.
    CREATE TABLE orders (
      id                TEXT PRIMARY KEY,
      location_id       TEXT NOT NULL REFERENCES locations(id),
      shift_id          TEXT NOT NULL REFERENCES shifts(id),
      daily_number      INTEGER NOT NULL,
      business_date     TEXT NOT NULL,
      channel           TEXT NOT NULL CHECK (channel IN ('dine_in','takeaway','delivery')),
      status            TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','placed','paid','refunded','cancelled')),
      subtotal_p        INTEGER NOT NULL DEFAULT 0,
      discount_p        INTEGER NOT NULL DEFAULT 0,
      service_charge_p  INTEGER NOT NULL DEFAULT 0,
      vat_p             INTEGER NOT NULL DEFAULT 0,
      total_p           INTEGER NOT NULL DEFAULT 0,
      staff_id          TEXT NOT NULL,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );
    -- Two sites may both have #42 today; one site may not.
    CREATE UNIQUE INDEX uq_order_daily_number
      ON orders(location_id, business_date, daily_number);
    CREATE INDEX idx_orders_status ON orders(status);
    CREATE INDEX idx_orders_shift ON orders(shift_id);

    CREATE TABLE order_lines (
      id               TEXT PRIMARY KEY,
      order_id         TEXT NOT NULL REFERENCES orders(id),
      menu_item_id     TEXT NOT NULL,
      name             TEXT NOT NULL,
      unit_price_p     INTEGER NOT NULL,
      quantity         INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
      -- Frozen at add-time from the order channel. ADR-002.
      vat_rate_bps     INTEGER NOT NULL,
      line_subtotal_p  INTEGER NOT NULL,
      line_discount_p  INTEGER NOT NULL DEFAULT 0,
      line_vat_p       INTEGER NOT NULL,
      line_total_p     INTEGER NOT NULL,
      modifiers_json   TEXT NOT NULL DEFAULT '[]',
      allergens_json   TEXT NOT NULL DEFAULT '[]',
      is_voided        INTEGER NOT NULL DEFAULT 0,
      void_reason      TEXT,
      created_at       TEXT NOT NULL
    );
    CREATE INDEX idx_order_lines_order ON order_lines(order_id);

    -- THE SOURCE OF TRUTH. Append-only.
    CREATE TABLE order_events (
      id         TEXT PRIMARY KEY,
      order_id   TEXT NOT NULL,
      type       TEXT NOT NULL,
      payload    TEXT NOT NULL,
      device_id  TEXT NOT NULL,
      sequence   INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    -- Replay ordering key. Also catches a sequence counter that got reset.
    CREATE UNIQUE INDEX uq_event_device_sequence ON order_events(device_id, sequence);
    CREATE INDEX idx_order_events_order ON order_events(order_id, sequence);

    -- Enforce append-only at the database level, not just by convention.
    -- A bug or a curious operator with a SQL client cannot rewrite history.
    CREATE TRIGGER trg_order_events_no_update
      BEFORE UPDATE ON order_events
    BEGIN
      SELECT RAISE(ABORT, 'order_events is append-only: UPDATE is forbidden');
    END;

    CREATE TRIGGER trg_order_events_no_delete
      BEFORE DELETE ON order_events
    BEGIN
      SELECT RAISE(ABORT, 'order_events is append-only: DELETE is forbidden');
    END;

    -- No raw card data. See docs/compliance.md.
    CREATE TABLE payments (
      id           TEXT PRIMARY KEY,
      order_id     TEXT NOT NULL REFERENCES orders(id),
      method       TEXT NOT NULL CHECK (method IN ('cash','card')),
      amount_p     INTEGER NOT NULL,
      tendered_p   INTEGER,
      provider_ref TEXT,
      card_last4   TEXT CHECK (card_last4 IS NULL OR length(card_last4) = 4),
      card_scheme  TEXT,
      auth_code    TEXT,
      status       TEXT NOT NULL DEFAULT 'completed'
                   CHECK (status IN ('pending','completed','failed','refunded')),
      staff_id     TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );
    CREATE INDEX idx_payments_order ON payments(order_id);

    -- ---------- Sync ----------

    CREATE TABLE sync_queue (
      id              TEXT PRIMARY KEY,
      entity          TEXT NOT NULL
                      CHECK (entity IN ('order_event','payment','stock_movement','shift')),
      entity_id       TEXT NOT NULL,
      payload         TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','in_flight','synced','failed')),
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_error      TEXT,
      next_attempt_at TEXT,
      created_at      TEXT NOT NULL,
      synced_at       TEXT
    );
    CREATE INDEX idx_sync_queue_drain ON sync_queue(status, next_attempt_at);
    CREATE INDEX idx_sync_queue_entity ON sync_queue(entity, entity_id);

    CREATE TABLE device_state (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- ---------- Inventory (eventually consistent) ----------

    CREATE TABLE inventory_items (
      id             TEXT PRIMARY KEY,
      location_id    TEXT NOT NULL,
      name           TEXT NOT NULL,
      unit           TEXT NOT NULL,
      quantity_milli INTEGER NOT NULL DEFAULT 0,
      updated_at     TEXT NOT NULL
    );

    CREATE TABLE stock_movements (
      id                TEXT PRIMARY KEY,
      inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id),
      delta_milli       INTEGER NOT NULL,
      reason            TEXT NOT NULL
                        CHECK (reason IN ('sale','waste','delivery','stock_take','transfer')),
      order_id          TEXT,
      staff_id          TEXT,
      created_at        TEXT NOT NULL
    );
    CREATE INDEX idx_stock_movements_item ON stock_movements(inventory_item_id);
  `,
};
