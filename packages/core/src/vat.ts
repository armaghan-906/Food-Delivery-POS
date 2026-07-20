import { pence, type Pence, type VatRateBps, type OrderChannel } from '@pos/types';
import { divRoundHalf } from './money.js';

/**
 * VAT for UK food service.
 *
 * Two rules drive everything here:
 *
 * 1. Menu prices are VAT-INCLUSIVE (gross). UK consumer law requires displayed
 *    prices to include VAT, so £8.99 is what the customer pays and VAT is
 *    extracted from it — never added on top.
 *
 * 2. The rate depends on the item AND the channel (ADR-002):
 *
 *              | Eat in | Takeaway
 *    Hot food  |  20%   |   20%
 *    Cold food |  20%   |    0%
 *
 * Consequence of (1) + (2): the same item at the same menu price yields
 * different VAT eat-in vs takeaway, so margin varies by channel. That is the
 * correct behaviour — the customer pays the advertised price either way.
 */

export interface VatRatedItem {
  vatRateEatInBps: VatRateBps;
  vatRateTakeawayBps: VatRateBps;
}

/**
 * Resolve the effective rate for an item on a given channel.
 *
 * Delivery is treated as takeaway — the food is not consumed on the premises,
 * which is what the eat-in/takeaway distinction actually turns on.
 */
export function resolveVatRateBps(item: VatRatedItem, channel: OrderChannel): VatRateBps {
  switch (channel) {
    case 'dine_in':
      return item.vatRateEatInBps;
    case 'takeaway':
    case 'delivery':
      return item.vatRateTakeawayBps;
  }
}

export interface VatBreakdown {
  /** Ex-VAT amount. */
  netP: Pence;
  /** The VAT itself. */
  vatP: Pence;
  /** Inc-VAT amount — what the customer pays. */
  grossP: Pence;
  rateBps: VatRateBps;
}

/**
 * Extract VAT from a VAT-inclusive amount.
 *
 * net = gross × 10000 / (10000 + rate), then vat = gross − net.
 *
 * Deriving VAT by subtraction rather than computing it directly guarantees
 * net + vat === gross exactly. Computing both independently can leave them
 * off by a penny, which shows up as a receipt that does not add up — and a
 * VAT return that does not reconcile.
 */
export function extractVat(grossP: Pence, rateBps: VatRateBps): VatBreakdown {
  if (rateBps === 0) {
    return { netP: grossP, vatP: pence(0), grossP, rateBps };
  }

  const netP = pence(divRoundHalf(grossP * 10_000, 10_000 + rateBps));
  const vatP = pence(grossP - netP);

  return { netP, vatP, grossP, rateBps };
}

/**
 * Aggregate VAT across lines, grouped by rate.
 *
 * Receipts and VAT returns need the breakdown per rate, not a single total —
 * a basket mixing 20% hot food and 0% cold takeaway must decompose. This is
 * what makes the data exportable for Making Tax Digital.
 *
 * VAT is extracted PER LINE and then summed, rather than summing gross and
 * extracting once. The two differ by up to a penny per rate group, and
 * per-line-then-sum is the one that keeps the printed lines adding up to the
 * printed summary. A receipt whose parts do not equal its whole is a receipt
 * a customer or an inspector will query.
 */
export function summariseVat(
  lines: readonly { grossP: Pence; rateBps: VatRateBps }[],
): VatBreakdown[] {
  const byRate = new Map<VatRateBps, { netP: number; vatP: number; grossP: number }>();

  for (const line of lines) {
    const { netP, vatP } = extractVat(line.grossP, line.rateBps);
    const running = byRate.get(line.rateBps) ?? { netP: 0, vatP: 0, grossP: 0 };
    byRate.set(line.rateBps, {
      netP: running.netP + netP,
      vatP: running.vatP + vatP,
      grossP: running.grossP + line.grossP,
    });
  }

  return [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rateBps, totals]) => ({
      rateBps,
      netP: pence(totals.netP),
      vatP: pence(totals.vatP),
      grossP: pence(totals.grossP),
    }));
}
