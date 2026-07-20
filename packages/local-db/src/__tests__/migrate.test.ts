import { describe, it, expect } from 'vitest';
import { initialiseDatabase, currentVersion, runMigrations, MIGRATIONS } from '../index.js';

function freshDb() {
  return initialiseDatabase({ path: ':memory:' });
}

describe('migrations', () => {
  it('applies the initial schema', () => {
    const { sqlite, applied } = freshDb();
    expect(applied).toEqual([1]);
    expect(currentVersion(sqlite)).toBe(1);
  });

  it('is idempotent — re-running applies nothing', () => {
    const { sqlite } = freshDb();
    expect(runMigrations(sqlite, MIGRATIONS)).toEqual([]);
  });

  it('creates every Phase 1 table', () => {
    const { sqlite } = freshDb();
    const names = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);

    for (const table of [
      'locations', 'categories', 'menu_items', 'modifier_groups', 'modifiers',
      'menu_item_modifier_groups', 'allergen_tags', 'staff', 'shifts',
      'cash_movements', 'orders', 'order_lines', 'order_events', 'payments',
      'sync_queue', 'device_state', 'inventory_items', 'stock_movements',
    ]) {
      expect(names, `missing table: ${table}`).toContain(table);
    }
  });
});

describe('durability pragmas', () => {
  it('enables WAL, full sync and foreign keys', () => {
    // WAL is unavailable for :memory:, so exercise a real file.
    const { sqlite } = initialiseDatabase({
      path: `/tmp/pos-test-${process.pid}.sqlite`,
    });
    expect(sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(sqlite.pragma('synchronous', { simple: true })).toBe(2); // FULL
    expect(sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    sqlite.close();
  });
});

describe('order_events is append-only', () => {
  function seedEvent(sqlite: ReturnType<typeof freshDb>['sqlite']) {
    sqlite
      .prepare(
        `INSERT INTO order_events (id, order_id, type, payload, device_id, sequence, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('evt-1', 'ord-1', 'ORDER_CREATED', '{}', 'dev-1', 1, '2026-07-20T10:00:00Z');
  }

  it('rejects UPDATE', () => {
    const { sqlite } = freshDb();
    seedEvent(sqlite);
    expect(() =>
      sqlite.prepare("UPDATE order_events SET type = 'TAMPERED' WHERE id = 'evt-1'").run(),
    ).toThrow(/append-only/);
  });

  it('rejects DELETE', () => {
    const { sqlite } = freshDb();
    seedEvent(sqlite);
    expect(() =>
      sqlite.prepare("DELETE FROM order_events WHERE id = 'evt-1'").run(),
    ).toThrow(/append-only/);
  });

  it('rejects a duplicate (device_id, sequence)', () => {
    const { sqlite } = freshDb();
    seedEvent(sqlite);
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO order_events (id, order_id, type, payload, device_id, sequence, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('evt-2', 'ord-1', 'ITEM_ADDED', '{}', 'dev-1', 1, '2026-07-20T10:00:01Z'),
    ).toThrow(/UNIQUE/i);
  });
});

describe('money and compliance constraints', () => {
  it('has no REAL columns anywhere — money must be integer pence', () => {
    const { sqlite } = freshDb();
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => (r as { name: string }).name);

    for (const table of tables) {
      const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{
        name: string;
        type: string;
      }>;
      for (const col of cols) {
        expect(col.type.toUpperCase(), `${table}.${col.name} is a float`).not.toMatch(
          /REAL|FLOAT|DOUBLE/,
        );
      }
    }
  });

  it('rejects a card_last4 that is not exactly 4 characters', () => {
    const { sqlite } = freshDb();
    // Guards against a full PAN being written into the last4 column.
    expect(() =>
      sqlite
        .prepare(
          `INSERT INTO payments (id, order_id, method, amount_p, card_last4, staff_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('pay-1', 'ord-1', 'card', 500, '4111111111111111', 'staff-1', '2026-07-20T10:00:00Z'),
    ).toThrow();
  });
});
