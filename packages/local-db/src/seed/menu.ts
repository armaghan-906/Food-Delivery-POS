import type { Allergen, AllergenPresence } from '@pos/types';

/**
 * Sample menu for development and testing.
 *
 * Deliberately covers the cases that break naive implementations:
 *
 *  - hot and cold items, so the takeaway 0% VAT path is actually exercised
 *  - a cold item that becomes hot when toasted (a MODIFIER changing VAT)
 *  - modifiers that introduce allergens the base item lacks
 *  - "may contain" as well as "contains"
 *  - a negative-price modifier
 *  - prices that do not divide evenly by 1.2, to catch rounding bugs
 *
 * Prices are VAT-INCLUSIVE integer pence.
 */

export interface SeedAllergen {
  allergen: Allergen;
  presence: AllergenPresence;
}

export interface SeedModifier {
  id: string;
  name: string;
  priceDeltaP: number;
  allergens?: SeedAllergen[];
  /** Makes the parent item hot — changes takeaway VAT from 0% to 20%. */
  makesHot?: boolean;
}

export interface SeedModifierGroup {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  modifiers: SeedModifier[];
}

export interface SeedMenuItem {
  id: string;
  name: string;
  description?: string;
  priceP: number;
  isHotFood: boolean;
  /** Cold food is zero-rated when taken away; hot food never is. */
  vatRateEatInBps: 0 | 500 | 2000;
  vatRateTakeawayBps: 0 | 500 | 2000;
  allergens?: SeedAllergen[];
  modifierGroupIds?: string[];
}

export interface SeedCategory {
  id: string;
  name: string;
  colour: string;
  sortOrder: number;
  items: SeedMenuItem[];
}

const contains = (a: Allergen): SeedAllergen => ({ allergen: a, presence: 'contains' });
const mayContain = (a: Allergen): SeedAllergen => ({ allergen: a, presence: 'may_contain' });

/** 20% both ways — hot food is standard-rated wherever it is eaten. */
const HOT = { isHotFood: true, vatRateEatInBps: 2000, vatRateTakeawayBps: 2000 } as const;
/** 20% eat-in, 0% takeaway — the rule a single vat_rate column gets wrong. */
const COLD = { isHotFood: false, vatRateEatInBps: 2000, vatRateTakeawayBps: 0 } as const;

export const SEED_MODIFIER_GROUPS: SeedModifierGroup[] = [
  {
    id: 'mg-burger-extras',
    name: 'Extras',
    minSelections: 0,
    maxSelections: 5,
    modifiers: [
      // Introduces milk, which the plain burger does not contain.
      { id: 'mod-cheese', name: 'Add cheese', priceDeltaP: 100, allergens: [contains('milk')] },
      { id: 'mod-bacon', name: 'Add bacon', priceDeltaP: 150 },
      {
        id: 'mod-egg',
        name: 'Add fried egg',
        priceDeltaP: 100,
        allergens: [contains('eggs')],
      },
      // Negative delta — the totals engine must handle this.
      { id: 'mod-no-sauce', name: 'No burger sauce', priceDeltaP: -50 },
    ],
  },
  {
    id: 'mg-doneness',
    name: 'How would you like it cooked?',
    minSelections: 1,
    maxSelections: 1,
    modifiers: [
      { id: 'mod-medium', name: 'Medium', priceDeltaP: 0 },
      { id: 'mod-well-done', name: 'Well done', priceDeltaP: 0 },
    ],
  },
  {
    id: 'mg-sandwich-options',
    name: 'Sandwich options',
    minSelections: 0,
    maxSelections: 2,
    modifiers: [
      // The interesting one: toasting makes it HOT, so a takeaway sandwich
      // moves from 0% to 20% VAT. Phase 1 does not yet re-resolve VAT from a
      // modifier — see the note in the package README.
      { id: 'mod-toasted', name: 'Toasted', priceDeltaP: 0, makesHot: true },
      {
        id: 'mod-extra-filling',
        name: 'Extra filling',
        priceDeltaP: 150,
      },
    ],
  },
  {
    id: 'mg-milk',
    name: 'Milk',
    minSelections: 1,
    maxSelections: 1,
    modifiers: [
      { id: 'mod-whole-milk', name: 'Whole milk', priceDeltaP: 0, allergens: [contains('milk')] },
      { id: 'mod-oat-milk', name: 'Oat milk', priceDeltaP: 40, allergens: [contains('gluten')] },
      { id: 'mod-soya-milk', name: 'Soya milk', priceDeltaP: 40, allergens: [contains('soybeans')] },
      { id: 'mod-no-milk', name: 'No milk', priceDeltaP: 0 },
    ],
  },
];

export const SEED_CATEGORIES: SeedCategory[] = [
  {
    id: 'cat-burgers',
    name: 'Burgers',
    colour: '#dc2626',
    sortOrder: 1,
    items: [
      {
        id: 'item-classic-burger',
        name: 'Classic Beef Burger',
        description: '6oz beef patty, lettuce, tomato, burger sauce',
        priceP: 899, // 899/1.2 does not divide evenly — good rounding test
        ...HOT,
        allergens: [contains('gluten'), contains('eggs'), mayContain('sesame')],
        modifierGroupIds: ['mg-burger-extras', 'mg-doneness'],
      },
      {
        id: 'item-chicken-burger',
        name: 'Buttermilk Chicken Burger',
        priceP: 949,
        ...HOT,
        allergens: [contains('gluten'), contains('milk'), contains('eggs')],
        modifierGroupIds: ['mg-burger-extras'],
      },
      {
        id: 'item-veggie-burger',
        name: 'Halloumi Burger',
        priceP: 849,
        ...HOT,
        allergens: [contains('gluten'), contains('milk')],
        modifierGroupIds: ['mg-burger-extras'],
      },
    ],
  },
  {
    id: 'cat-sides',
    name: 'Sides',
    colour: '#ea580c',
    sortOrder: 2,
    items: [
      {
        id: 'item-fries',
        name: 'Skin-on Fries',
        priceP: 350,
        ...HOT,
        allergens: [mayContain('gluten')],
      },
      {
        id: 'item-loaded-fries',
        name: 'Loaded Cheese Fries',
        priceP: 550,
        ...HOT,
        allergens: [contains('milk'), mayContain('gluten')],
      },
      {
        id: 'item-onion-rings',
        name: 'Onion Rings',
        priceP: 425,
        ...HOT,
        allergens: [contains('gluten'), mayContain('eggs')],
      },
      {
        id: 'item-slaw',
        name: 'Coleslaw',
        priceP: 250,
        ...COLD, // cold side — zero-rated takeaway
        allergens: [contains('eggs'), contains('mustard'), contains('celery')],
      },
    ],
  },
  {
    id: 'cat-sandwiches',
    name: 'Sandwiches',
    colour: '#16a34a',
    sortOrder: 3,
    items: [
      {
        id: 'item-cheese-sandwich',
        name: 'Cheese & Pickle Sandwich',
        priceP: 425,
        ...COLD,
        allergens: [contains('gluten'), contains('milk')],
        modifierGroupIds: ['mg-sandwich-options'],
      },
      {
        id: 'item-tuna-sandwich',
        name: 'Tuna Mayo Sandwich',
        priceP: 450,
        ...COLD,
        allergens: [contains('gluten'), contains('fish'), contains('eggs')],
        modifierGroupIds: ['mg-sandwich-options'],
      },
      {
        id: 'item-blt',
        name: 'BLT Sandwich',
        priceP: 475,
        ...COLD,
        allergens: [contains('gluten'), contains('eggs')],
        modifierGroupIds: ['mg-sandwich-options'],
      },
    ],
  },
  {
    id: 'cat-hot-drinks',
    name: 'Hot Drinks',
    colour: '#7c3aed',
    sortOrder: 4,
    items: [
      {
        id: 'item-americano',
        name: 'Americano',
        priceP: 275,
        ...HOT, // hot drinks are standard-rated either way
        modifierGroupIds: ['mg-milk'],
      },
      {
        id: 'item-latte',
        name: 'Latte',
        priceP: 325,
        ...HOT,
        allergens: [contains('milk')],
        modifierGroupIds: ['mg-milk'],
      },
      {
        id: 'item-tea',
        name: 'Yorkshire Tea',
        priceP: 225,
        ...HOT,
        modifierGroupIds: ['mg-milk'],
      },
    ],
  },
  {
    id: 'cat-cold-drinks',
    name: 'Cold Drinks',
    colour: '#0891b2',
    sortOrder: 5,
    items: [
      {
        id: 'item-cola',
        name: 'Cola (330ml)',
        priceP: 195,
        // Soft drinks are ALWAYS standard-rated, hot or cold, eat-in or
        // takeaway — the cold-food zero rate does not apply to them.
        isHotFood: false,
        vatRateEatInBps: 2000,
        vatRateTakeawayBps: 2000,
      },
      {
        id: 'item-orange-juice',
        name: 'Orange Juice',
        priceP: 245,
        isHotFood: false,
        vatRateEatInBps: 2000,
        vatRateTakeawayBps: 2000,
      },
      {
        id: 'item-water',
        name: 'Still Water (500ml)',
        priceP: 150,
        isHotFood: false,
        vatRateEatInBps: 2000,
        vatRateTakeawayBps: 2000,
      },
    ],
  },
  {
    id: 'cat-desserts',
    name: 'Desserts',
    colour: '#db2777',
    sortOrder: 6,
    items: [
      {
        id: 'item-brownie',
        name: 'Chocolate Brownie',
        priceP: 425,
        ...COLD,
        allergens: [
          contains('gluten'),
          contains('eggs'),
          contains('milk'),
          contains('soybeans'),
          mayContain('nuts'),
          mayContain('peanuts'),
        ],
      },
      {
        id: 'item-cheesecake',
        name: 'Baked Vanilla Cheesecake',
        priceP: 495,
        ...COLD,
        allergens: [contains('gluten'), contains('milk'), contains('eggs')],
      },
    ],
  },
];

/** Every allergen referenced anywhere in the seed — used to sanity-check coverage. */
export function seedAllergensUsed(): Set<Allergen> {
  const used = new Set<Allergen>();
  for (const category of SEED_CATEGORIES) {
    for (const item of category.items) {
      for (const tag of item.allergens ?? []) used.add(tag.allergen);
    }
  }
  for (const group of SEED_MODIFIER_GROUPS) {
    for (const modifier of group.modifiers) {
      for (const tag of modifier.allergens ?? []) used.add(tag.allergen);
    }
  }
  return used;
}
