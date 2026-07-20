import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Menu data is pulled DOWN from central (central wins, last-write-wins by
 * updatedAt). The till never originates menu changes, so there is no outbox
 * entry for these tables.
 */

export const locations = sqliteTable('locations', {
  id: text('id').primaryKey(), // UUIDv4
  name: text('name').notNull(),
  addressLine1: text('address_line1').notNull(),
  addressLine2: text('address_line2'),
  city: text('city').notNull(),
  postcode: text('postcode').notNull(),
  /** Required on VAT receipts. */
  vatNumber: text('vat_number').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Display order on the order screen. */
  sortOrder: integer('sort_order').notNull().default(0),
  colour: text('colour'), // hex, for touch-target tiles
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  updatedAt: text('updated_at').notNull(),
});

export const menuItems = sqliteTable(
  'menu_items',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id),
    name: text('name').notNull(),
    description: text('description'),
    /** Integer pence. See ADR-001. */
    priceP: integer('price_p').notNull(),

    /**
     * VAT is a function of item AND channel — see ADR-002. Hot takeaway food
     * is 20%, cold takeaway food is 0%, everything eaten in is 20%.
     * Stored as basis points (2000 = 20%).
     */
    vatRateEatInBps: integer('vat_rate_eat_in_bps').notNull().default(2000),
    vatRateTakeawayBps: integer('vat_rate_takeaway_bps').notNull().default(2000),

    /** Drives the takeaway VAT decision; also useful for kitchen routing. */
    isHotFood: integer('is_hot_food', { mode: 'boolean' }).notNull().default(false),

    sortOrder: integer('sort_order').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_menu_items_category').on(t.categoryId)],
);

export const modifierGroups = sqliteTable('modifier_groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull(), // "Choose your side"
  /** Selection constraints, enforced in packages/core. */
  minSelections: integer('min_selections').notNull().default(0),
  maxSelections: integer('max_selections').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

export const modifiers = sqliteTable(
  'modifiers',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id')
      .notNull()
      .references(() => modifierGroups.id),
    name: text('name').notNull(),
    /** Can be negative (e.g. "no cheese -50p"). Integer pence. */
    priceDeltaP: integer('price_delta_p').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_modifiers_group').on(t.groupId)],
);

/** Which modifier groups apply to which items. */
export const menuItemModifierGroups = sqliteTable(
  'menu_item_modifier_groups',
  {
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    modifierGroupId: text('modifier_group_id')
      .notNull()
      .references(() => modifierGroups.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('idx_mimg_item').on(t.menuItemId)],
);

/**
 * Allergens attach to items AND modifiers — a modifier can introduce an
 * allergen the base item doesn't have (cheese on a vegan burger).
 * See docs/compliance.md.
 */
export const allergenTags = sqliteTable(
  'allergen_tags',
  {
    id: text('id').primaryKey(),
    /** Discriminator: which table ownerId points at. */
    ownerType: text('owner_type', { enum: ['menu_item', 'modifier'] }).notNull(),
    ownerId: text('owner_id').notNull(),
    /** One of the 14 statutory allergens — see @pos/types ALLERGENS. */
    allergen: text('allergen').notNull(),
    /** 'contains' and 'may_contain' are legally different claims. */
    presence: text('presence', { enum: ['contains', 'may_contain'] })
      .notNull()
      .default('contains'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_allergen_owner').on(t.ownerType, t.ownerId)],
);
