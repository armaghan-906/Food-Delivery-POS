import { describe, it, expect } from 'vitest';
import { pence, poundsToPence, formatPence } from '@pos/types';
import { divRoundHalf, multiply, sum, percentOf } from '../money.js';

describe('divRoundHalf', () => {
  it('rounds half away from zero', () => {
    expect(divRoundHalf(5, 2)).toBe(3); // 2.5 -> 3
    expect(divRoundHalf(7, 2)).toBe(4); // 3.5 -> 4
    expect(divRoundHalf(-5, 2)).toBe(-3); // -2.5 -> -3, NOT -2
  });

  it('is symmetric about zero, so refunds exactly reverse sales', () => {
    // Math.round(-2.5) is -2, which would make a refund a penny off the sale.
    for (let n = 1; n <= 200; n++) {
      expect(divRoundHalf(-n, 3)).toBe(-divRoundHalf(n, 3));
    }
  });

  it('rounds below half down and above half up', () => {
    expect(divRoundHalf(4, 3)).toBe(1); // 1.33
    expect(divRoundHalf(5, 3)).toBe(2); // 1.67
  });

  it('rejects division by zero', () => {
    expect(() => divRoundHalf(1, 0)).toThrow(RangeError);
  });

  it('rejects non-integer input', () => {
    expect(() => divRoundHalf(1.5, 2)).toThrow(TypeError);
  });
});

describe('multiply', () => {
  it('scales by quantity', () => {
    expect(multiply(pence(899), 3)).toBe(2697);
  });

  it('rejects a fractional quantity', () => {
    expect(() => multiply(pence(899), 1.5)).toThrow(TypeError);
  });
});

describe('sum', () => {
  it('adds amounts', () => {
    expect(sum([pence(100), pence(250), pence(5)])).toBe(355);
  });

  it('sums an empty list to zero rather than throwing', () => {
    expect(sum([])).toBe(0);
  });
});

describe('percentOf', () => {
  it('computes a service charge', () => {
    expect(percentOf(pence(2000), 1250)).toBe(250); // 12.5% of £20
  });

  it('rounds half away from zero', () => {
    expect(percentOf(pence(1), 5000)).toBe(1); // 0.5p -> 1p
  });
});

describe('pence guard', () => {
  it('rejects a float that leaked into the money path', () => {
    expect(() => pence(8.99)).toThrow(TypeError);
  });

  it('converts pounds to pence without float drift', () => {
    // 0.1 + 0.2 !== 0.3 is exactly the class of bug this prevents.
    expect(poundsToPence(8.99)).toBe(899);
    expect(poundsToPence(0.1) + poundsToPence(0.2)).toBe(poundsToPence(0.3));
  });
});

describe('formatPence', () => {
  it('formats pounds and pence', () => {
    expect(formatPence(pence(899))).toBe('£8.99');
    expect(formatPence(pence(1000))).toBe('£10.00');
    expect(formatPence(pence(5))).toBe('£0.05');
  });

  it('formats negatives for refunds', () => {
    expect(formatPence(pence(-250))).toBe('-£2.50');
  });
});
