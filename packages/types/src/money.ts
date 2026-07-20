/**
 * Money is always integer pence. See docs/decisions.md ADR-001.
 *
 * The branded type makes it a compile error to pass a raw number — including
 * a float that survived a JSON round-trip — into the money path.
 */
export type Pence = number & { readonly __brand: 'Pence' };

/** Construct a Pence value. Throws on non-integers rather than rounding silently. */
export function pence(value: number): Pence {
  if (!Number.isInteger(value)) {
    throw new TypeError(`Money must be integer pence, received ${value}`);
  }
  return value as Pence;
}

/** Convenience for literals and seed data: 8.99 -> 899p. */
export function poundsToPence(pounds: number): Pence {
  return pence(Math.round(pounds * 100));
}

/** Display only. Never feed the result back into a stored value. */
export function formatPence(value: Pence): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const formatted = `£${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${formatted}` : formatted;
}

/**
 * VAT rates as basis points (2000 = 20.0%), so rate arithmetic stays in
 * integers too. UK food service uses 0% and 20%; 5% exists for other sectors
 * and is included because reduced rate has been used before and may be again.
 */
export type VatRateBps = 0 | 500 | 2000;

export const VAT_ZERO: VatRateBps = 0;
export const VAT_REDUCED: VatRateBps = 500;
export const VAT_STANDARD: VatRateBps = 2000;
