/**
 * The 14 allergens regulated under the UK Food Information Regulations
 * (Natasha's Law). This list is statutory — do not add to it, do not
 * reorder it, do not make it configurable.
 *
 * See docs/compliance.md.
 */
export const ALLERGENS = [
  'celery',
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'lupin',
  'milk',
  'molluscs',
  'mustard',
  'nuts',
  'peanuts',
  'sesame',
  'soybeans',
  'sulphites',
] as const;

export type Allergen = (typeof ALLERGENS)[number];

/** Staff-facing labels. Deliberately explicit — ambiguity here is a safety issue. */
export const ALLERGEN_LABELS: Record<Allergen, string> = {
  celery: 'Celery',
  gluten: 'Cereals containing gluten',
  crustaceans: 'Crustaceans',
  eggs: 'Eggs',
  fish: 'Fish',
  lupin: 'Lupin',
  milk: 'Milk',
  molluscs: 'Molluscs',
  mustard: 'Mustard',
  nuts: 'Tree nuts',
  peanuts: 'Peanuts',
  sesame: 'Sesame',
  soybeans: 'Soybeans',
  sulphites: 'Sulphur dioxide / sulphites',
};

/**
 * "Contains" and "may contain" are legally and practically different claims.
 * Collapsing them is the failure mode that hurts people.
 */
export type AllergenPresence = 'contains' | 'may_contain';

export interface AllergenTag {
  allergen: Allergen;
  presence: AllergenPresence;
}
