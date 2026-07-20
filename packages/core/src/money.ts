import { pence, type Pence } from '@pos/types';

/**
 * Integer division rounding half away from zero.
 *
 * This is the ONLY rounding function in the money path (ADR-001). Everything
 * that needs to round goes through here, so the till and the cloud cannot
 * disagree about a half-penny.
 *
 * Half-away-from-zero rather than JavaScript's `Math.round` because
 * `Math.round(-2.5)` is -2 (half-up toward +∞), which would round refunds and
 * discounts differently from the sales they reverse. A refund must be the exact
 * negative of its sale.
 */
export function divRoundHalf(numerator: number, denominator: number): number {
  if (denominator === 0) throw new RangeError('Division by zero in money calculation');
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new TypeError('divRoundHalf requires integers');
  }

  const negative = numerator < 0 !== denominator < 0;
  const absN = Math.abs(numerator);
  const absD = Math.abs(denominator);

  const quotient = Math.floor((absN * 2 + absD) / (absD * 2));
  return negative ? -quotient : quotient;
}

/** Multiply a money value by an integer quantity. */
export function multiply(amount: Pence, quantity: number): Pence {
  if (!Number.isInteger(quantity)) {
    throw new TypeError(`Quantity must be an integer, received ${quantity}`);
  }
  return pence(amount * quantity);
}

/** Sum money values. Empty sum is zero, not an error. */
export function sum(amounts: readonly Pence[]): Pence {
  return pence(amounts.reduce<number>((total, amount) => total + amount, 0));
}

/**
 * Apply a percentage expressed in basis points (2000 = 20%).
 * Used for service charge and percentage discounts.
 */
export function percentOf(amount: Pence, bps: number): Pence {
  return pence(divRoundHalf(amount * bps, 10_000));
}
