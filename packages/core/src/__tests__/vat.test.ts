import { describe, it, expect } from 'vitest';
import { poundsToPence, pence, VAT_STANDARD, VAT_ZERO } from '@pos/types';
import { resolveVatRateBps, extractVat, summariseVat } from '../vat.js';

const hotFood = { vatRateEatInBps: VAT_STANDARD, vatRateTakeawayBps: VAT_STANDARD } as const;
const coldFood = { vatRateEatInBps: VAT_STANDARD, vatRateTakeawayBps: VAT_ZERO } as const;

describe('resolveVatRateBps', () => {
  it('charges 20% on hot food regardless of channel', () => {
    expect(resolveVatRateBps(hotFood, 'dine_in')).toBe(2000);
    expect(resolveVatRateBps(hotFood, 'takeaway')).toBe(2000);
    expect(resolveVatRateBps(hotFood, 'delivery')).toBe(2000);
  });

  it('charges 20% on cold food eaten in but 0% taken away', () => {
    expect(resolveVatRateBps(coldFood, 'dine_in')).toBe(2000);
    expect(resolveVatRateBps(coldFood, 'takeaway')).toBe(0);
  });

  it('treats delivery as takeaway — food is not consumed on the premises', () => {
    expect(resolveVatRateBps(coldFood, 'delivery')).toBe(0);
  });
});

describe('extractVat', () => {
  it('extracts VAT from a VAT-inclusive price', () => {
    // £12.00 inc VAT at 20% -> £10.00 net + £2.00 VAT
    const result = extractVat(poundsToPence(12), VAT_STANDARD);
    expect(result.netP).toBe(1000);
    expect(result.vatP).toBe(200);
    expect(result.grossP).toBe(1200);
  });

  it('returns zero VAT at the zero rate', () => {
    const result = extractVat(poundsToPence(3.5), VAT_ZERO);
    expect(result.netP).toBe(350);
    expect(result.vatP).toBe(0);
  });

  it('always satisfies net + vat === gross, across a wide range', () => {
    // The invariant that keeps receipts adding up.
    for (let gross = 1; gross <= 5000; gross++) {
      const { netP, vatP } = extractVat(pence(gross), VAT_STANDARD);
      expect(netP + vatP).toBe(gross);
    }
  });

  it('handles the awkward £8.99 case', () => {
    // 899 / 1.2 = 749.166… -> net 749, VAT 150
    const { netP, vatP } = extractVat(poundsToPence(8.99), VAT_STANDARD);
    expect(netP).toBe(749);
    expect(vatP).toBe(150);
    expect(netP + vatP).toBe(899);
  });

  it('extracts nothing from zero', () => {
    const { netP, vatP } = extractVat(pence(0), VAT_STANDARD);
    expect(netP).toBe(0);
    expect(vatP).toBe(0);
  });

  it('handles negative amounts symmetrically, for refunds', () => {
    const sale = extractVat(poundsToPence(8.99), VAT_STANDARD);
    const refund = extractVat(pence(-899), VAT_STANDARD);
    // A refund must be the exact negative of the sale it reverses.
    expect(refund.netP).toBe(-sale.netP);
    expect(refund.vatP).toBe(-sale.vatP);
  });
});

describe('summariseVat', () => {
  it('groups a mixed-rate basket by rate', () => {
    const breakdown = summariseVat([
      { grossP: poundsToPence(12), rateBps: VAT_STANDARD },
      { grossP: poundsToPence(3), rateBps: VAT_ZERO },
      { grossP: poundsToPence(6), rateBps: VAT_STANDARD },
    ]);

    expect(breakdown).toHaveLength(2);

    const zero = breakdown.find((b) => b.rateBps === 0);
    const standard = breakdown.find((b) => b.rateBps === 2000);

    expect(zero?.grossP).toBe(300);
    expect(zero?.vatP).toBe(0);

    expect(standard?.grossP).toBe(1800);
    expect(standard?.vatP).toBe(300); // £3.00 VAT on £18.00 inc
  });

  it('keeps the summary equal to the sum of its lines', () => {
    // Per-line-then-sum, so printed lines always add up to the printed summary.
    const lines = [
      { grossP: poundsToPence(8.99), rateBps: VAT_STANDARD },
      { grossP: poundsToPence(8.99), rateBps: VAT_STANDARD },
      { grossP: poundsToPence(8.99), rateBps: VAT_STANDARD },
    ];

    const perLineVat = lines.reduce((s, l) => s + extractVat(l.grossP, l.rateBps).vatP, 0);
    const [summary] = summariseVat(lines);

    expect(summary?.vatP).toBe(perLineVat);
    expect(summary?.vatP).toBe(450); // 150 × 3
  });

  it('returns an empty breakdown for an empty basket', () => {
    expect(summariseVat([])).toEqual([]);
  });
});
