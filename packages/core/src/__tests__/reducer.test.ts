import { describe, it, expect } from 'vitest';
import type { AnyOrderEvent } from '@pos/types';
import { replay, applyEvent, OrderReplayError } from '../order/reducer.js';
import { eventLog } from './helpers.js';

describe('replay', () => {
  it('returns null for an empty log', () => {
    expect(replay([])).toBeNull();
  });

  it('builds an order from ORDER_CREATED', () => {
    const state = replay(eventLog().created('takeaway').build());
    expect(state?.orderId).toBe('ord-1');
    expect(state?.channel).toBe('takeaway');
    expect(state?.dailyNumber).toBe(42);
    expect(state?.status).toBe('draft');
    expect(state?.lines).toEqual([]);
  });

  it('accumulates added items', () => {
    const state = replay(
      eventLog()
        .created()
        .itemAdded('line-1', { unitPrice: 899, name: 'Burger' })
        .itemAdded('line-2', { unitPrice: 350, name: 'Fries' })
        .build(),
    );
    expect(state?.lines).toHaveLength(2);
    expect(state?.lines[0]?.name).toBe('Burger');
  });

  it('flags voided lines rather than removing them', () => {
    // A voided line is evidence — it must survive in the audit trail.
    const state = replay(
      eventLog()
        .created()
        .itemAdded('line-1', { unitPrice: 899 })
        .itemVoided('line-1', 'Sent back')
        .build(),
    );
    expect(state?.lines).toHaveLength(1);
    expect(state?.lines[0]?.isVoided).toBe(true);
    expect(state?.lines[0]?.voidReason).toBe('Sent back');
  });

  it('tracks payments and status transitions', () => {
    const state = replay(
      eventLog()
        .created()
        .itemAdded('line-1', { unitPrice: 899 })
        .placed()
        .cashPayment(899, 1000)
        .build(),
    );
    expect(state?.status).toBe('placed');
    expect(state?.payments).toHaveLength(1);
    expect(state?.payments[0]?.tenderedP).toBe(1000);
  });

  it('records refunds and marks the order refunded', () => {
    const state = replay(
      eventLog()
        .created()
        .itemAdded('line-1', { unitPrice: 899 })
        .cashPayment(899, 899)
        .refund(899)
        .build(),
    );
    expect(state?.status).toBe('refunded');
    expect(state?.refundedP).toBe(899);
  });
});

describe('replay determinism', () => {
  it('is order-independent — shuffled events replay identically', () => {
    // This is what lets the cloud and the till reach the same conclusion
    // regardless of the order events arrive over a flaky connection.
    const events = eventLog()
      .created()
      .itemAdded('line-1', { unitPrice: 899 })
      .itemAdded('line-2', { unitPrice: 350 })
      .quantityChanged('line-1', 3)
      .placed()
      .build();

    const forwards = replay(events);
    const backwards = replay([...events].reverse());
    const shuffled = replay([events[2]!, events[0]!, events[4]!, events[1]!, events[3]!]);

    expect(backwards).toEqual(forwards);
    expect(shuffled).toEqual(forwards);
  });

  it('sorts by sequence, not by wall-clock timestamp', () => {
    // ADR-003: a till whose clock jumped backwards must still replay correctly.
    const events = eventLog()
      .created()
      .itemAdded('line-1', { unitPrice: 899 })
      .quantityChanged('line-1', 5)
      .build();

    // Staff changed the system clock — the later event now has an earlier time.
    const clockSkewed = events.map((e, i) =>
      i === 2 ? { ...e, createdAt: '2020-01-01T00:00:00Z' } : e,
    ) as AnyOrderEvent[];

    expect(replay(clockSkewed)?.lines[0]?.quantity).toBe(5);
  });
});

describe('replay error handling', () => {
  it('rejects an event arriving before ORDER_CREATED', () => {
    const events = eventLog().created().itemAdded('line-1', { unitPrice: 899 }).build();
    expect(() => replay([events[1]!])).toThrow(OrderReplayError);
  });

  it('rejects a duplicate ORDER_CREATED', () => {
    const events = eventLog().created().created().build();
    expect(() => replay(events)).toThrow(/created twice/);
  });

  it('rejects an event referencing an unknown line', () => {
    const events = eventLog().created().itemVoided('does-not-exist').build();
    expect(() => replay(events)).toThrow(/unknown line/);
  });

  it('ignores unknown event types from a newer version', () => {
    // Forward compatibility: an older till must not crash mid-service on an
    // event type it has never heard of.
    const events = eventLog().created().itemAdded('line-1', { unitPrice: 899 }).build();
    const withFuture = [
      ...events,
      { ...events[1]!, id: 'evt-future', type: 'LOYALTY_POINTS_EARNED', sequence: 99 },
    ] as AnyOrderEvent[];

    expect(() => replay(withFuture)).not.toThrow();
    expect(replay(withFuture)?.lines).toHaveLength(1);
  });
});

describe('applyEvent purity', () => {
  it('does not mutate the state it is given', () => {
    const base = replay(eventLog().created().itemAdded('line-1', { unitPrice: 899 }).build())!;
    const snapshot = structuredClone(base);

    const [nextEvent] = eventLog().created().itemAdded('line-2', { unitPrice: 350 }).build().slice(1);
    applyEvent(base, nextEvent!);

    expect(base).toEqual(snapshot);
  });
});
