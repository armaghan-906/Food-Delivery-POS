import { describe, it, expect } from 'vitest';
import type { AllergenTag } from '@pos/types';
import { mergeAllergens, checkAllergenConflicts } from '../allergens.js';

const contains = (a: AllergenTag['allergen']): AllergenTag => ({
  allergen: a,
  presence: 'contains',
});
const mayContain = (a: AllergenTag['allergen']): AllergenTag => ({
  allergen: a,
  presence: 'may_contain',
});

describe('mergeAllergens', () => {
  it('unions item and modifier allergens', () => {
    // A modifier can introduce an allergen the base item lacks.
    const result = mergeAllergens([contains('gluten')], [contains('milk')]);
    expect(result.map((t) => t.allergen)).toEqual(['gluten', 'milk']);
  });

  it('upgrades "may contain" to "contains" when both are present', () => {
    // Never downgrade to the weaker claim — that direction of error is the
    // one that hurts people.
    const result = mergeAllergens([mayContain('milk')], [contains('milk')]);
    expect(result).toHaveLength(1);
    expect(result[0]?.presence).toBe('contains');
  });

  it('does not downgrade "contains" to "may contain"', () => {
    const result = mergeAllergens([contains('peanuts')], [mayContain('peanuts')]);
    expect(result[0]?.presence).toBe('contains');
  });

  it('returns a deterministic order so receipts are stable', () => {
    const a = mergeAllergens([contains('sesame')], [contains('celery')], [contains('milk')]);
    const b = mergeAllergens([contains('milk')], [contains('sesame')], [contains('celery')]);
    expect(a).toEqual(b);
    expect(a.map((t) => t.allergen)).toEqual(['celery', 'milk', 'sesame']);
  });

  it('handles empty input', () => {
    expect(mergeAllergens()).toEqual([]);
    expect(mergeAllergens([], [])).toEqual([]);
  });
});

describe('checkAllergenConflicts', () => {
  it('separates definite from precautionary matches', () => {
    const result = checkAllergenConflicts(
      [contains('milk'), mayContain('peanuts'), contains('gluten')],
      ['milk', 'peanuts'],
    );
    expect(result.contains).toEqual(['milk']);
    expect(result.mayContain).toEqual(['peanuts']);
  });

  it('reports nothing when there is no overlap', () => {
    const result = checkAllergenConflicts([contains('milk')], ['fish']);
    expect(result.contains).toEqual([]);
    expect(result.mayContain).toEqual([]);
  });

  it('never silently drops a "may contain" match', () => {
    // The weaker claim must still surface — it is a legal disclosure.
    const result = checkAllergenConflicts([mayContain('nuts')], ['nuts']);
    expect(result.mayContain).toEqual(['nuts']);
  });
});
