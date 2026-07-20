import { describe, it, expect } from 'vitest';
import { pence, VAT_STANDARD, VAT_ZERO, type AnyOrderEvent } from '@pos/types';
import {
  createOrder,
  addItem,
  voidItem,
  changeQuantity,
  applyDiscount,
  placeOrder,
  takeCashPayment,
  cancelOrder,
  issueRefund,
  CommandError,
  PermissionDeniedError,
  type CommandContext,
  type MenuItemInput,
} from '../order/commands.js';
import { replay } from '../order/reducer.js';
import { computeTotals } from '../order/totals.js';
import type { StaffRole } from '../auth/permissions.js';

/** Deterministic context — no real clock, no real UUIDs. */
function context(role: StaffRole = 'server'): CommandContext {
  let idCounter = 0;
  let sequence = 0;
  return {
    deviceId: 'dev-1',
    staffId: 'staff-1',
    staffRole: role,
    now: () => new Date('2026-07-20T12:00:00Z'),
    newId: () => `id-${++idCounter}`,
    nextSequence: () => ++sequence,
  };
}

const coldSandwich: MenuItemInput = {
  id: 'item-cold',
  name: 'Cheese sandwich',
  priceP: pence(350),
  vatRateEatInBps: VAT_STANDARD,
  vatRateTakeawayBps: VAT_ZERO,
  allergens: [
    { allergen: 'gluten', presence: 'contains' },
    { allergen: 'milk', presence: 'contains' },
  ],
};

const hotBurger: MenuItemInput = {
  id: 'item-hot',
  name: 'Beef burger',
  priceP: pence(899),
  vatRateEatInBps: VAT_STANDARD,
  vatRateTakeawayBps: VAT_STANDARD,
  allergens: [{ allergen: 'gluten', presence: 'contains' }],
};

/** Build an order by running commands and folding the results. */
function orderWith(ctx: CommandContext, channel: 'dine_in' | 'takeaway' = 'dine_in') {
  const events: AnyOrderEvent[] = [
    createOrder(ctx, {
      orderId: 'ord-1',
      locationId: 'loc-1',
      shiftId: 'shift-1',
      channel,
      dailyNumber: 1,
      businessDate: '2026-07-20',
    }),
  ];
  const state = () => replay(events)!;
  const run = (event: AnyOrderEvent) => {
    events.push(event);
    return state();
  };
  return { events, state, run };
}

describe('createOrder', () => {
  it('emits ORDER_CREATED', () => {
    const ctx = context();
    const event = createOrder(ctx, {
      orderId: 'ord-1',
      locationId: 'loc-1',
      shiftId: 'shift-1',
      channel: 'takeaway',
      dailyNumber: 7,
      businessDate: '2026-07-20',
    });
    expect(event.type).toBe('ORDER_CREATED');
    expect(event.deviceId).toBe('dev-1');
    expect(event.sequence).toBe(1);
  });

  it('rejects a daily number below 1', () => {
    expect(() =>
      createOrder(context(), {
        orderId: 'ord-1',
        locationId: 'loc-1',
        shiftId: 'shift-1',
        channel: 'dine_in',
        dailyNumber: 0,
        businessDate: '2026-07-20',
      }),
    ).toThrow(CommandError);
  });
});

describe('addItem', () => {
  it('freezes the eat-in VAT rate onto the line', () => {
    const ctx = context();
    const o = orderWith(ctx, 'dine_in');
    const state = o.run(addItem(ctx, o.state(), { item: coldSandwich }));
    expect(state.lines[0]?.vatRateBps).toBe(2000);
  });

  it('freezes the zero takeaway rate for cold food', () => {
    // The case a single vat_rate column would get legally wrong.
    const ctx = context();
    const o = orderWith(ctx, 'takeaway');
    const state = o.run(addItem(ctx, o.state(), { item: coldSandwich }));
    expect(state.lines[0]?.vatRateBps).toBe(0);
    expect(computeTotals(state).vatP).toBe(0);
  });

  it('still charges 20% on hot food taken away', () => {
    const ctx = context();
    const o = orderWith(ctx, 'takeaway');
    const state = o.run(addItem(ctx, o.state(), { item: hotBurger }));
    expect(state.lines[0]?.vatRateBps).toBe(2000);
  });

  it('merges modifier allergens into the line', () => {
    const ctx = context();
    const o = orderWith(ctx);
    const state = o.run(
      addItem(ctx, o.state(), {
        item: hotBurger, // gluten only
        modifiers: [
          {
            modifierId: 'mod-cheese',
            name: 'Add cheese',
            priceDeltaP: pence(100),
            allergens: [{ allergen: 'milk', presence: 'contains' }],
          },
        ],
      }),
    );
    // The modifier introduced an allergen the base item lacked.
    expect(state.lines[0]?.allergens.map((a) => a.allergen)).toEqual(['gluten', 'milk']);
  });

  it('rejects a zero or fractional quantity', () => {
    const ctx = context();
    const o = orderWith(ctx);
    expect(() => addItem(ctx, o.state(), { item: hotBurger, quantity: 0 })).toThrow(
      CommandError,
    );
    expect(() => addItem(ctx, o.state(), { item: hotBurger, quantity: 1.5 })).toThrow(
      CommandError,
    );
  });
});

describe('voidItem permissions', () => {
  it('lets a server void before payment', () => {
    const ctx = context('server');
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    const lineId = o.state().lines[0]!.lineId;
    expect(() => voidItem(ctx, o.state(), lineId, 'Changed mind')).not.toThrow();
  });

  it('stops a server voiding AFTER payment', () => {
    // Money has moved — this needs a second person.
    const ctx = context('server');
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    o.run(placeOrder(ctx, o.state()));
    o.run(takeCashPayment(ctx, o.state(), { amountP: pence(899), tenderedP: pence(1000) }));

    const lineId = o.state().lines[0]!.lineId;
    expect(() => voidItem(ctx, o.state(), lineId, 'Mistake')).toThrow(PermissionDeniedError);
  });

  it('lets a supervisor void after payment', () => {
    const server = context('server');
    const o = orderWith(server);
    o.run(addItem(server, o.state(), { item: hotBurger }));
    o.run(placeOrder(server, o.state()));
    o.run(
      takeCashPayment(server, o.state(), { amountP: pence(899), tenderedP: pence(1000) }),
    );

    const supervisor = context('supervisor');
    const lineId = o.state().lines[0]!.lineId;
    expect(() => voidItem(supervisor, o.state(), lineId, 'Mistake')).not.toThrow();
  });

  it('requires a reason', () => {
    const ctx = context('supervisor');
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    const lineId = o.state().lines[0]!.lineId;
    expect(() => voidItem(ctx, o.state(), lineId, '   ')).toThrow(/reason is required/);
  });

  it('refuses to void the same line twice', () => {
    const ctx = context('supervisor');
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    const lineId = o.state().lines[0]!.lineId;
    o.run(voidItem(ctx, o.state(), lineId, 'Mistake'));
    expect(() => voidItem(ctx, o.state(), lineId, 'Again')).toThrow(/already voided/);
  });
});

describe('discounts', () => {
  it('requires supervisor or above', () => {
    const ctx = context('server');
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    expect(() =>
      applyDiscount(ctx, o.state(), {
        amountP: pence(100),
        description: 'Goodwill',
        scope: { kind: 'order' },
      }),
    ).toThrow(PermissionDeniedError);
  });

  it('refuses a discount larger than the order', () => {
    const ctx = context('supervisor');
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger })); // 899
    expect(() =>
      applyDiscount(ctx, o.state(), {
        amountP: pence(1000),
        description: 'Too much',
        scope: { kind: 'order' },
      }),
    ).toThrow(/exceeds order total/);
  });

  it('rejects a discount on an unknown line', () => {
    const ctx = context('supervisor');
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    expect(() =>
      applyDiscount(ctx, o.state(), {
        amountP: pence(100),
        description: 'x',
        scope: { kind: 'line', lineId: 'nope' },
      }),
    ).toThrow(/Unknown line/);
  });
});

describe('placeOrder', () => {
  it('refuses to place an empty order', () => {
    const ctx = context();
    const o = orderWith(ctx);
    expect(() => placeOrder(ctx, o.state())).toThrow(/empty order/);
  });

  it('refuses to place an order whose only line is voided', () => {
    const ctx = context('supervisor');
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    o.run(voidItem(ctx, o.state(), o.state().lines[0]!.lineId, 'Mistake'));
    expect(() => placeOrder(ctx, o.state())).toThrow(/empty order/);
  });
});

describe('takeCashPayment', () => {
  it('accepts exact payment', () => {
    const ctx = context();
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    const state = o.run(
      takeCashPayment(ctx, o.state(), { amountP: pence(899), tenderedP: pence(899) }),
    );
    expect(computeTotals(state).outstandingP).toBe(0);
    expect(computeTotals(state).changeDueP).toBe(0);
  });

  it('computes change from over-tender', () => {
    const ctx = context();
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    const state = o.run(
      takeCashPayment(ctx, o.state(), { amountP: pence(899), tenderedP: pence(2000) }),
    );
    expect(computeTotals(state).changeDueP).toBe(1101);
  });

  it('rejects tender below the payment amount', () => {
    const ctx = context();
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    expect(() =>
      takeCashPayment(ctx, o.state(), { amountP: pence(899), tenderedP: pence(500) }),
    ).toThrow(/less than/);
  });

  it('rejects overpayment beyond the outstanding balance', () => {
    const ctx = context();
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    expect(() =>
      takeCashPayment(ctx, o.state(), { amountP: pence(2000), tenderedP: pence(2000) }),
    ).toThrow(/exceeds outstanding/);
  });

  it('supports split payment across two tenders', () => {
    const ctx = context();
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger })); // 899
    o.run(takeCashPayment(ctx, o.state(), { amountP: pence(400), tenderedP: pence(400) }));
    expect(computeTotals(o.state()).outstandingP).toBe(499);
    const state = o.run(
      takeCashPayment(ctx, o.state(), { amountP: pence(499), tenderedP: pence(500) }),
    );
    expect(computeTotals(state).outstandingP).toBe(0);
  });
});

describe('cancel and refund', () => {
  it('refuses to cancel a paid order', () => {
    const ctx = context('supervisor');
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    o.run(takeCashPayment(ctx, o.state(), { amountP: pence(899), tenderedP: pence(899) }));
    expect(() => cancelOrder(ctx, o.state(), 'Walked out')).toThrow(/Refund the payment/);
  });

  it('refuses to refund more than was paid', () => {
    const ctx = context('supervisor');
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    o.run(takeCashPayment(ctx, o.state(), { amountP: pence(899), tenderedP: pence(899) }));
    expect(() => issueRefund(ctx, o.state(), pence(1000), 'Wrong')).toThrow(/only 899p/);
  });

  it('stops a server issuing refunds', () => {
    const server = context('server');
    const o = orderWith(server);
    o.run(addItem(server, o.state(), { item: hotBurger }));
    o.run(
      takeCashPayment(server, o.state(), { amountP: pence(899), tenderedP: pence(899) }),
    );
    expect(() => issueRefund(server, o.state(), pence(899), 'Wrong')).toThrow(
      PermissionDeniedError,
    );
  });
});

describe('command determinism', () => {
  it('produces monotonic sequence numbers', () => {
    const ctx = context();
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    o.run(addItem(ctx, o.state(), { item: coldSandwich }));
    expect(o.events.map((e) => e.sequence)).toEqual([1, 2, 3]);
  });

  it('never mutates the order it is given', () => {
    const ctx = context();
    const o = orderWith(ctx);
    o.run(addItem(ctx, o.state(), { item: hotBurger }));
    const before = structuredClone(o.state());
    addItem(ctx, o.state(), { item: coldSandwich }); // result discarded
    expect(o.state()).toEqual(before);
  });
});
