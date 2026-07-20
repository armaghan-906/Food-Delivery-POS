import { pence, type Pence, type VatRateBps } from '@pos/types';
import { divRoundHalf } from '../money.js';
import { summariseVat, type VatBreakdown } from '../vat.js';
import type { OrderState, OrderLineState } from './state.js';

export interface LineTotals {
  lineId: string;
  /** Unit price + modifier deltas, VAT-inclusive. */
  unitGrossP: Pence;
  /** unitGross × quantity, before any discount. */
  subtotalP: Pence;
  discountP: Pence;
  /** After discount — what this line contributes to the order. */
  grossP: Pence;
  netP: Pence;
  vatP: Pence;
  rateBps: VatRateBps;
}

export interface OrderTotals {
  lines: LineTotals[];
  /** Sum of line subtotals before any discount. */
  subtotalP: Pence;
  /** Line discounts + order discount, combined. */
  discountP: Pence;
  serviceChargeP: Pence;
  /** VAT decomposed by rate — required for the receipt and for MTD. */
  vatBreakdown: VatBreakdown[];
  vatP: Pence;
  netP: Pence;
  /** What the customer pays. */
  totalP: Pence;
  paidP: Pence;
  /** Positive means still owed; negative means overpaid. */
  outstandingP: Pence;
  changeDueP: Pence;
}

/** Unit price including modifier deltas. Modifiers can be negative. */
export function lineUnitGross(line: OrderLineState): Pence {
  const modifierTotal = line.modifiers.reduce<number>((sum, m) => sum + m.priceDeltaP, 0);
  return pence(line.unitPriceP + modifierTotal);
}

/**
 * Compute every total for an order.
 *
 * Ordering of operations matters and is deliberate:
 *
 *   1. Line gross  = (unit + modifiers) × quantity
 *   2. Line discount subtracted
 *   3. Order-level discount apportioned across lines *pro rata by gross*
 *   4. VAT extracted per line from the final discounted gross
 *
 * Step 3 is the subtle one. A whole-order discount has to be spread across
 * lines before VAT is worked out, because lines may sit at different rates.
 * Applying it to the order total instead would silently move value between the
 * 20% and 0% buckets and misstate the VAT owed.
 *
 * Voided lines contribute nothing but are retained in the output so the
 * receipt and the audit trail can still show them.
 */
export function computeTotals(order: OrderState): OrderTotals {
  const active = order.lines.filter((l) => !l.isVoided);

  // Steps 1 and 2.
  const preApportion = active.map((line) => {
    const unitGrossP = lineUnitGross(line);
    const subtotalP = pence(unitGrossP * line.quantity);
    const grossAfterLineDiscount = pence(subtotalP - line.discountP);
    return { line, unitGrossP, subtotalP, grossAfterLineDiscount };
  });

  const discountableTotal = preApportion.reduce<number>(
    (sum, l) => sum + l.grossAfterLineDiscount,
    0,
  );

  // Step 3: apportion the order discount pro rata by gross.
  //
  // The last line absorbs any rounding remainder so the apportioned parts sum
  // exactly to the discount. Without this, a £10 discount across three lines
  // can apportion to £9.99 and the order total is a penny out.
  const orderDiscount = Math.min(order.orderDiscountP, discountableTotal);
  let apportioned = 0;

  const lineTotals: LineTotals[] = preApportion.map((entry, index) => {
    const isLast = index === preApportion.length - 1;

    const share =
      discountableTotal === 0
        ? 0
        : isLast
          ? orderDiscount - apportioned
          : divRoundHalf(orderDiscount * entry.grossAfterLineDiscount, discountableTotal);

    apportioned += share;

    const grossP = pence(entry.grossAfterLineDiscount - share);

    // Step 4: VAT extracted per line, from the final discounted gross.
    const { netP, vatP } = extractLineVat(grossP, entry.line.vatRateBps);

    return {
      lineId: entry.line.lineId,
      unitGrossP: entry.unitGrossP,
      subtotalP: entry.subtotalP,
      discountP: pence(entry.line.discountP + share),
      grossP,
      netP,
      vatP,
      rateBps: entry.line.vatRateBps,
    };
  });

  const vatBreakdown = summariseVat(
    lineTotals.map((l) => ({ grossP: l.grossP, rateBps: l.rateBps })),
  );

  const subtotalP = pence(preApportion.reduce<number>((s, l) => s + l.subtotalP, 0));
  const lineDiscounts = active.reduce<number>((s, l) => s + l.discountP, 0);
  const goodsGross = lineTotals.reduce<number>((s, l) => s + l.grossP, 0);

  // Service charge is added after goods. It is outside the VAT breakdown here
  // because its treatment depends on whether it is discretionary — a business
  // rule to settle before Phase 2 (see the note in the package README).
  const totalP = pence(goodsGross + order.serviceChargeP);

  const vatP = pence(vatBreakdown.reduce<number>((s, b) => s + b.vatP, 0));
  const netP = pence(vatBreakdown.reduce<number>((s, b) => s + b.netP, 0));

  const paidP = pence(order.payments.reduce<number>((s, p) => s + p.amountP, 0));
  const outstandingP = pence(totalP - paidP);

  // Change is only ever owed on cash. Card overpayment is not a thing.
  const tendered = order.payments.reduce<number>(
    (s, p) => s + (p.method === 'cash' ? (p.tenderedP ?? p.amountP) : p.amountP),
    0,
  );
  const changeDueP = pence(Math.max(0, tendered - totalP));

  return {
    lines: lineTotals,
    subtotalP,
    discountP: pence(lineDiscounts + orderDiscount),
    serviceChargeP: order.serviceChargeP,
    vatBreakdown,
    vatP,
    netP,
    totalP,
    paidP,
    outstandingP,
    changeDueP,
  };
}

function extractLineVat(grossP: Pence, rateBps: VatRateBps): { netP: Pence; vatP: Pence } {
  if (rateBps === 0) return { netP: grossP, vatP: pence(0) };
  const netP = pence(divRoundHalf(grossP * 10_000, 10_000 + rateBps));
  return { netP, vatP: pence(grossP - netP) };
}
