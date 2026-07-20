import { describe, it, expect } from 'vitest';
import { initialiseDatabase } from '../index.js';
import { seedDatabase, SEED_STAFF, seedAllergensUsed } from '../seed/index.js';
import { verifyPin } from '../auth/pin.js';

async function seeded() {
  const { sqlite } = initialiseDatabase({ path: ':memory:' });
  const result = await seedDatabase(sqlite);
  return { sqlite, result };
}

describe('seedDatabase', () => {
  it('populates the menu', async () => {
    const { result } = await seeded();
    expect(result.skipped).toBe(false);
    expect(result.categories).toBe(6);
    expect(result.items).toBeGreaterThan(15);
    expect(result.staff).toBe(4);
  });

  it('is idempotent — a second run inserts nothing', async () => {
    const { sqlite } = await seeded();
    const countItems = () =>
      (sqlite.prepare('SELECT COUNT(*) AS n FROM menu_items').get() as { n: number }).n;

    const before = countItems();
    const second = await seedDatabase(sqlite);

    expect(second.skipped).toBe(true);
    // Compare against the observed count rather than a literal, so adding a
    // menu item does not break this test.
    expect(countItems()).toBe(before);
  });

  it('hashes staff PINs and never stores them in clear', async () => {
    const { sqlite } = await seeded();
    const rows = sqlite.prepare('SELECT id, pin_hash FROM staff').all() as Array<{
      id: string;
      pin_hash: string;
    }>;

    for (const member of SEED_STAFF) {
      const row = rows.find((r) => r.id === member.id);
      expect(row).toBeDefined();
      expect(row!.pin_hash).not.toContain(member.pin);
      expect(await verifyPin(member.pin, row!.pin_hash)).toBe(true);
    }
  });
});

describe('seed data exercises the VAT rules', () => {
  it('includes hot items that are 20% on both channels', async () => {
    const { sqlite } = await seeded();
    const hot = sqlite
      .prepare('SELECT * FROM menu_items WHERE is_hot_food = 1 LIMIT 1')
      .get() as { vat_rate_eat_in_bps: number; vat_rate_takeaway_bps: number };
    expect(hot.vat_rate_eat_in_bps).toBe(2000);
    expect(hot.vat_rate_takeaway_bps).toBe(2000);
  });

  it('includes cold FOOD that is zero-rated takeaway', async () => {
    // Without at least one of these, the 0% code path is never tested.
    const { sqlite } = await seeded();
    const cold = sqlite
      .prepare('SELECT COUNT(*) AS n FROM menu_items WHERE vat_rate_takeaway_bps = 0')
      .get() as { n: number };
    expect(cold.n).toBeGreaterThan(0);
  });

  it('keeps soft drinks standard-rated even though they are cold', async () => {
    // A common misreading of the rule: the cold-food zero rate does not
    // extend to soft drinks.
    const { sqlite } = await seeded();
    const cola = sqlite
      .prepare("SELECT * FROM menu_items WHERE id = 'item-cola'")
      .get() as { is_hot_food: number; vat_rate_takeaway_bps: number };
    expect(cola.is_hot_food).toBe(0);
    expect(cola.vat_rate_takeaway_bps).toBe(2000);
  });

  it('has prices that do not divide evenly by 1.2', async () => {
    // Guards against a seed of only round numbers, which would hide rounding bugs.
    const { sqlite } = await seeded();
    const awkward = sqlite
      .prepare('SELECT COUNT(*) AS n FROM menu_items WHERE (price_p * 10000) % 12000 != 0')
      .get() as { n: number };
    expect(awkward.n).toBeGreaterThan(0);
  });
});

describe('seed data exercises allergen handling', () => {
  it('tags allergens on both items and modifiers', async () => {
    const { sqlite } = await seeded();
    const byOwner = sqlite
      .prepare('SELECT owner_type, COUNT(*) AS n FROM allergen_tags GROUP BY owner_type')
      .all() as Array<{ owner_type: string; n: number }>;

    expect(byOwner.find((r) => r.owner_type === 'menu_item')?.n).toBeGreaterThan(0);
    expect(byOwner.find((r) => r.owner_type === 'modifier')?.n).toBeGreaterThan(0);
  });

  it('includes a modifier that introduces an allergen the item lacks', async () => {
    // Cheese on a burger that has no milk — the case that hurts people if missed.
    const { sqlite } = await seeded();
    const cheeseMilk = sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM allergen_tags
         WHERE owner_type = 'modifier' AND owner_id = 'mod-cheese' AND allergen = 'milk'`,
      )
      .get() as { n: number };
    expect(cheeseMilk.n).toBe(1);

    const burgerMilk = sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM allergen_tags
         WHERE owner_type = 'menu_item' AND owner_id = 'item-classic-burger' AND allergen = 'milk'`,
      )
      .get() as { n: number };
    expect(burgerMilk.n).toBe(0);
  });

  it('uses both "contains" and "may contain"', async () => {
    const { sqlite } = await seeded();
    const presences = sqlite
      .prepare('SELECT DISTINCT presence FROM allergen_tags')
      .all() as Array<{ presence: string }>;
    const values = presences.map((p) => p.presence);
    expect(values).toContain('contains');
    expect(values).toContain('may_contain');
  });

  it('covers a broad spread of the 14 statutory allergens', async () => {
    const used = seedAllergensUsed();
    expect(used.size).toBeGreaterThanOrEqual(9);
  });
});
