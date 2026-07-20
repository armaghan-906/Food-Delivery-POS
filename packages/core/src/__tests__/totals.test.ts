import { describe, it, expect } from 'vitest';
import { VAT_STANDARD, VAT_ZERO } from '@pos/types';
import { replay } from '../order/reducer.js';
import { computeTotals } from '../order/totals.js';
import { eventLog } from './helpers.js';

const totalsFor = (events: ReturnType<ReturnType<typeof eventLog>['build']>) =>
  computeTotals(replay(events)!);

describe('basic totals', () => {
  it('totals an empty order to zero', () => {
    const t = totalsFor(eventLog().created().build());
    expect(t.totalP).toBe(0);
    expect(t.vatP).toBe(0);
    expect(t.vatBreakdown).toEqual([]);
  });

  it('totals a single line', () => {
    const t = totalsFor(
      eventLog().created().itemAdded('l1', { unitPrice: 899, name: 'Burger' }).build(),
    );
    expect(t.subtotalP).toBe(899);
    expect(t.totalP).toBe(899);
    expect(t.vatP).toBe(150);
    expect(t.netP).toBe(749);
  });

  it('multiplies by quantity', () => {
    const t = totalsFor(
      eventLog()
        .created()
        .itemAdded('l1', { unitPrice: 899 })
        .quantityChanged('l1', 3)
        .build(),
    );
    expect(t.totalP).toBe(2697); // 8.99 × 3
    expect(t.lines[0]?.subtotalP).toBe(2697);
  });

  it('includes modifier price deltas, positive and negative', () => {
    const t = totalsFor(
      eventLog()
        .created()
        .itemAdded('l1', {
          unitPrice: 899,
          modifiers: [
            { modifierId: 'm1', name: 'Extra cheese', priceDelta: 100 },
            { modifierId: 'm2', name: 'No bacon', priceDelta: -50 },
          ],
        })
        .build(),
    );
    expect(t.lines[0]?.unitGrossP).toBe(949); // 899 + 100 − 50
    expect(t.totalP).toBe(949);
  });

  it('excludes voided lines from the total but keeps them visible', () => {
    const t = totalsFor(
      eventLog()
        .created()
        .itemAdded('l1', { unitPrice: 899 })
        .itemAdded('l2', { unitPrice: 350 })
        .itemVoided('l2')
        .build(),
    );
    expect(t.totalP).toBe(899);
    expect(t.lines).toHaveLength(1); // only active lines carry totals
  });
});

describe('mixed VAT rates', () => {
  it('decomposes a hot/cold takeaway basket', () => {
    // Hot food 20%, cold takeaway 0% — the case a single vat_rate column
    // would get legally wrong.
    const t = totalsFor(
      eventLog()
        .created('takeaway')
        .itemAdded('l1', { unitPrice: 600, name: 'Hot soup', vatRateBps: VAT_STANDARD })
        .itemAdded('l2', { unitPrice: 300, name: 'Cold sandwich', vatRateBps: VAT_ZERO })
        .build(),
    );

    expect(t.totalP).toBe(900);
    expect(t.vatP).toBe(100); // only on the hot item
    expect(t.vatBreakdown).toHaveLength(2);
    expect(t.vatBreakdown.find((b) => b.rateBps === 0)?.vatP).toBe(0);
    expect(t.vatBreakdown.find((b) => b.rateBps === 2000)?.vatP).toBe(100);
  });
});

describe('discounts', () => {
  it('applies a line discount before VAT', () => {
    const t = totalsFor(
      eventLog().created().itemAdded('l1', { unitPrice: 1200 }).lineDiscount('l1', 200).build(),
    );
    expect(t.totalP).toBe(1000);
    expect(t.vatP).toBe(167); // VAT on £10.00 inc, not £12.00
  });

  it('apportions an order discount across lines pro rata', () => {
    const t = totalsFor(
      eventLog()
        .created()
        .itemAdded('l1', { unitPrice: 1000 })
        .itemAdded('l2', { unitPrice: 1000 })
        .orderDiscount(400)
        .build(),
    );
    expect(t.totalP).toBe(1600);
    expect(t.lines[0]?.discountP).toBe(200);
    expect(t.lines[1]?.discountP).toBe(200);
  });

  it('apportions across MIXED rates so VAT is not misstated', () => {
    // The reason apportionment exists. A £3 discount on a basket that is half
    // 20% and half 0% must reduce each bucket proportionally — applying it to
    // the order total would silently move value between VAT rates.
    const t = totalsFor(
      eventLog()
        .created('takeaway')
        .itemAdded('l1', { unitPrice: 600, vatRateBps: VAT_STANDARD })
        .itemAdded('l2', { unitPrice: 600, vatRateBps: VAT_ZERO })
        .orderDiscount(300)
        .build(),
    );

    expect(t.totalP).toBe(900);
    expect(t.lines[0]?.grossP).toBe(450);
    expect(t.lines[1]?.grossP).toBe(450);
    // VAT only on the discounted standard-rated half.
    expect(t.vatP).toBe(75);
  });

  it('never loses a penny to rounding when apportioning', () => {
    // £10 across three equal lines cannot divide evenly. The apportioned
    // shares must still sum exactly to the discount.
    const t = totalsFor(
      eventLog()
        .created()
        .itemAdded('l1', { unitPrice: 1000 })
        .itemAdded('l2', { unitPrice: 1000 })
        .itemAdded('l3', { unitPrice: 1000 })
        .orderDiscount(1000)
        .build(),
    );

    const apportioned = t.lines.reduce((s, l) => s + l.discountP, 0);
    expect(apportioned).toBe(1000);
    expect(t.totalP).toBe(2000);
  });

  it('caps a discount at the order value — a basket cannot go negative', () => {
    const t = totalsFor(
      eventLog().created().itemAdded('l1', { unitPrice: 500 }).orderDiscount(900).build(),
    );
    expect(t.totalP).toBe(0);
    expect(t.totalP).toBeGreaterThanOrEqual(0);
  });
});

describe('payment and change', () => {
  it('computes change due on cash', () => {
    const t = totalsFor(
      eventLog()
        .created()
        .itemAdded('l1', { unitPrice: 899 })
        .cashPayment(899, 2000)
        .build(),
    );
    expect(t.paidP).toBe(899);
    expect(t.outstandingP).toBe(0);
    expect(t.changeDueP).toBe(1101);
  });

  it('reports outstanding balance on a part payment', () => {
    const t = totalsFor(
      eventLog()
        .created()
        .itemAdded('l1', { unitPrice: 1000 })
        .cashPayment(400, 400)
        .build(),
    );
    expect(t.outstandingP).toBe(600);
    expect(t.changeDueP).toBe(0);
  });

  it('gives no change when tendered exactly', () => {
    const t = totalsFor(
      eventLog().created().itemAdded('l1', { unitPrice: 899 }).cashPayment(899, 899).build(),
    );
    expect(t.changeDueP).toBe(0);
  });
});

describe('service charge', () => {
  it('adds service charge on top of goods', () => {
    const t = totalsFor(
      eventLog().created().itemAdded('l1', { unitPrice: 2000 }).serviceCharge(250).build(),
    );
    expect(t.serviceChargeP).toBe(250);
    expect(t.totalP).toBe(2250);
  });
});

describe('invariants', () => {
  it('keeps line totals summing to the order total', () => {
    const t = totalsFor(
      eventLog()
        .created('takeaway')
        .itemAdded('l1', { unitPrice: 899, vatRateBps: VAT_STANDARD })
        .itemAdded('l2', { unitPrice: 350, vatRateBps: VAT_ZERO })
        .itemAdded('l3', { unitPrice: 1250, vatRateBps: VAT_STANDARD })
        .quantityChanged('l3', 2)
        .orderDiscount(500)
        .build(),
    );

    const lineSum = t.lines.reduce((s, l) => s + l.grossP, 0);
    expect(lineSum + t.serviceChargeP).toBe(t.totalP);
  });

  it('keeps net + VAT equal to goods total', () => {
    const t = totalsFor(
      eventLog()
        .created()
        .itemAdded('l1', { unitPrice: 899 })
        .itemAdded('l2', { unitPrice: 1349 })
        .orderDiscount(333)
        .build(),
    );
    expect(t.netP + t.vatP).toBe(t.totalP - t.serviceChargeP);
  });
});
