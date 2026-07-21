import type { Allergen } from '@pos/types';
import {
  SEED_CATEGORIES,
  SEED_MODIFIER_GROUPS,
  type SeedCategory,
  type SeedMenuItem,
  type SeedModifierGroup,
} from '@pos/local-db/menu';

/**
 * Read-only view of the menu for the till UI.
 *
 * The seed data is the same shape the local DB stores, so wiring this to real
 * IPC-served menu data later is a drop-in swap — the components only ever see
 * `CatalogItem` / `CatalogCategory`.
 */

export interface CatalogItem extends SeedMenuItem {
  categoryId: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  colour: string;
  count: number;
}

export const CATEGORIES: CatalogCategory[] = [...SEED_CATEGORIES]
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((c: SeedCategory) => ({
    id: c.id,
    name: c.name,
    colour: c.colour,
    count: c.items.length,
  }));

export const ITEMS: CatalogItem[] = SEED_CATEGORIES.flatMap((c) =>
  c.items.map((item) => ({ ...item, categoryId: c.id })),
);

const ITEM_BY_ID = new Map(ITEMS.map((i) => [i.id, i]));

export function itemById(id: string): CatalogItem | undefined {
  return ITEM_BY_ID.get(id);
}

const GROUP_BY_ID = new Map(SEED_MODIFIER_GROUPS.map((g) => [g.id, g]));

/** The modifier groups an item offers, in link order. */
export function modifierGroupsForItem(item: CatalogItem): SeedModifierGroup[] {
  return (item.modifierGroupIds ?? [])
    .map((id) => GROUP_BY_ID.get(id))
    .filter((g): g is SeedModifierGroup => Boolean(g));
}

/** Does tapping this item need the modifier slide-over, or can it add directly? */
export function itemHasModifiers(item: CatalogItem): boolean {
  return modifierGroupsForItem(item).length > 0;
}

/** Short, unambiguous badges for the 14 statutory allergens. */
export const ALLERGEN_ABBR: Record<Allergen, string> = {
  celery: 'CEL',
  gluten: 'GLU',
  crustaceans: 'CRU',
  eggs: 'EGG',
  fish: 'FSH',
  lupin: 'LUP',
  milk: 'MLK',
  molluscs: 'MOL',
  mustard: 'MUS',
  nuts: 'NUT',
  peanuts: 'PNT',
  sesame: 'SES',
  soybeans: 'SOY',
  sulphites: 'SUL',
};
