import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { hashPin } from '../auth/pin.js';
import { SEED_CATEGORIES, SEED_MODIFIER_GROUPS } from './menu.js';

export * from './menu.js';

/**
 * Development seed data.
 *
 * Idempotent — running it twice does not duplicate rows. Safe to call on every
 * dev boot.
 *
 * The staff PINs here are for DEVELOPMENT ONLY and are printed to the console
 * on seed. In production, staff and menu arrive by downward sync from central
 * and this module is never invoked.
 */

export interface SeedStaff {
  id: string;
  name: string;
  pin: string;
  role: 'server' | 'supervisor' | 'manager' | 'admin';
}

/** Dev logins. Note these avoid the banned-PIN list in auth/pin.ts. */
export const SEED_STAFF: SeedStaff[] = [
  { id: 'staff-sam', name: 'Sam Okafor', pin: '4829', role: 'server' },
  { id: 'staff-riley', name: 'Riley Chen', pin: '7391', role: 'supervisor' },
  { id: 'staff-morgan', name: 'Morgan Ellis', pin: '6274', role: 'manager' },
  { id: 'staff-admin', name: 'System Admin', pin: '9518', role: 'admin' },
];

export const SEED_LOCATION = {
  id: 'loc-demo-1',
  name: 'Demo Kitchen — Manchester',
  addressLine1: '14 Oxford Road',
  addressLine2: null,
  city: 'Manchester',
  postcode: 'M1 5QA',
  // Placeholder. A real VAT number must be configured before trading.
  vatNumber: 'GB000000000',
};

export interface SeedResult {
  categories: number;
  items: number;
  modifierGroups: number;
  modifiers: number;
  allergenTags: number;
  staff: number;
  skipped: boolean;
}

export async function seedDatabase(sqlite: Database.Database): Promise<SeedResult> {
  const existing = sqlite.prepare('SELECT COUNT(*) AS n FROM menu_items').get() as {
    n: number;
  };

  if (existing.n > 0) {
    return {
      categories: 0,
      items: 0,
      modifierGroups: 0,
      modifiers: 0,
      allergenTags: 0,
      staff: 0,
      skipped: true,
    };
  }

  const now = new Date().toISOString();

  // Hash PINs before opening the transaction — scrypt is async and
  // better-sqlite3 transactions must stay synchronous throughout.
  const staffWithHashes = await Promise.all(
    SEED_STAFF.map(async (member) => ({
      ...member,
      pinHash: await hashPin(member.pin),
    })),
  );

  const counts = { allergenTags: 0, modifiers: 0, items: 0 };

  const insert = sqlite.transaction(() => {
    sqlite
      .prepare(
        `INSERT INTO locations (id, name, address_line1, address_line2, city, postcode, vat_number, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        SEED_LOCATION.id,
        SEED_LOCATION.name,
        SEED_LOCATION.addressLine1,
        SEED_LOCATION.addressLine2,
        SEED_LOCATION.city,
        SEED_LOCATION.postcode,
        SEED_LOCATION.vatNumber,
        now,
      );

    const staffStmt = sqlite.prepare(
      `INSERT INTO staff (id, location_id, name, pin_hash, role, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    );
    for (const member of staffWithHashes) {
      staffStmt.run(member.id, SEED_LOCATION.id, member.name, member.pinHash, member.role, now);
    }

    const allergenStmt = sqlite.prepare(
      `INSERT INTO allergen_tags (id, owner_type, owner_id, allergen, presence, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );

    const groupStmt = sqlite.prepare(
      `INSERT INTO modifier_groups (id, name, min_selections, max_selections, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const modifierStmt = sqlite.prepare(
      `INSERT INTO modifiers (id, group_id, name, price_delta_p, sort_order, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    );

    SEED_MODIFIER_GROUPS.forEach((group, groupIndex) => {
      groupStmt.run(
        group.id,
        group.name,
        group.minSelections,
        group.maxSelections,
        groupIndex,
        now,
      );

      group.modifiers.forEach((modifier, modifierIndex) => {
        modifierStmt.run(modifier.id, group.id, modifier.name, modifier.priceDeltaP, modifierIndex, now);
        counts.modifiers += 1;

        for (const tag of modifier.allergens ?? []) {
          allergenStmt.run(randomUUID(), 'modifier', modifier.id, tag.allergen, tag.presence, now);
          counts.allergenTags += 1;
        }
      });
    });

    const categoryStmt = sqlite.prepare(
      `INSERT INTO categories (id, name, sort_order, colour, is_active, updated_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
    );
    const itemStmt = sqlite.prepare(
      `INSERT INTO menu_items
         (id, category_id, name, description, price_p, vat_rate_eat_in_bps,
          vat_rate_takeaway_bps, is_hot_food, sort_order, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    );
    const linkStmt = sqlite.prepare(
      `INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id, sort_order)
       VALUES (?, ?, ?)`,
    );

    for (const category of SEED_CATEGORIES) {
      categoryStmt.run(category.id, category.name, category.sortOrder, category.colour, now);

      category.items.forEach((item, itemIndex) => {
        itemStmt.run(
          item.id,
          category.id,
          item.name,
          item.description ?? null,
          item.priceP,
          item.vatRateEatInBps,
          item.vatRateTakeawayBps,
          item.isHotFood ? 1 : 0,
          itemIndex,
          now,
        );
        counts.items += 1;

        for (const tag of item.allergens ?? []) {
          allergenStmt.run(randomUUID(), 'menu_item', item.id, tag.allergen, tag.presence, now);
          counts.allergenTags += 1;
        }

        (item.modifierGroupIds ?? []).forEach((groupId, linkIndex) => {
          linkStmt.run(item.id, groupId, linkIndex);
        });
      });
    }
  });

  insert();

  return {
    categories: SEED_CATEGORIES.length,
    items: counts.items,
    modifierGroups: SEED_MODIFIER_GROUPS.length,
    modifiers: counts.modifiers,
    allergenTags: counts.allergenTags,
    staff: SEED_STAFF.length,
    skipped: false,
  };
}
