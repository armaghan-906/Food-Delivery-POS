import type { Allergen, AllergenTag } from '@pos/types';

/**
 * Allergen aggregation for a line item.
 *
 * The effective allergen set is the union of the base item and every selected
 * modifier — a modifier can introduce an allergen the base item does not have
 * (cheese on a vegan burger). Missing that is how someone gets hurt.
 */

/**
 * Merge allergen tags, keeping the STRONGER claim when both appear.
 *
 * If an item says "may contain milk" and a selected modifier says "contains
 * milk", the result is "contains milk". Downgrading to the weaker claim would
 * understate the risk; that direction of error is the one that matters.
 */
export function mergeAllergens(...sources: readonly AllergenTag[][]): AllergenTag[] {
  const strongest = new Map<Allergen, AllergenTag>();

  for (const source of sources) {
    for (const tag of source) {
      const existing = strongest.get(tag.allergen);
      // 'contains' always wins over 'may_contain'.
      if (!existing || (existing.presence === 'may_contain' && tag.presence === 'contains')) {
        strongest.set(tag.allergen, tag);
      }
    }
  }

  // Stable alphabetical order so receipts and warnings are deterministic.
  return [...strongest.values()].sort((a, b) => a.allergen.localeCompare(b.allergen));
}

/**
 * Does this line conflict with a customer's declared allergen?
 *
 * Returns both definite and precautionary matches, kept separate so the UI can
 * present them differently. Both must be shown — never silently drop
 * "may contain" because it is the weaker claim.
 */
export function checkAllergenConflicts(
  lineAllergens: readonly AllergenTag[],
  customerAvoids: readonly Allergen[],
): { contains: Allergen[]; mayContain: Allergen[] } {
  const avoid = new Set(customerAvoids);

  const contains: Allergen[] = [];
  const mayContain: Allergen[] = [];

  for (const tag of lineAllergens) {
    if (!avoid.has(tag.allergen)) continue;
    if (tag.presence === 'contains') contains.push(tag.allergen);
    else mayContain.push(tag.allergen);
  }

  return { contains, mayContain };
}
