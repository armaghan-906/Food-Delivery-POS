import { pence, type AnyOrderEvent, type OrderEvent } from '@pos/types';
import type { OrderState, OrderLineState } from './state.js';

/**
 * The order reducer: fold an append-only event log into current state.
 *
 * Pure and total — same events in, same state out, no I/O, no clock, no
 * randomness. That is what lets the till and the cloud independently replay
 * the same log and reach byte-identical conclusions.
 *
 * Unknown event types are ignored rather than throwing, so an older till can
 * replay a log containing events from a newer version without crashing mid
 * service. Forward compatibility matters when you cannot update every terminal
 * in the estate at once.
 */

export class OrderReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderReplayError';
  }
}

function requireLine(state: OrderState, lineId: string): OrderLineState {
  const line = state.lines.find((l) => l.lineId === lineId);
  if (!line) throw new OrderReplayError(`Event references unknown line ${lineId}`);
  return line;
}

function initialState(event: OrderEvent<'ORDER_CREATED'>): OrderState {
  const p = event.payload;
  return {
    orderId: event.orderId,
    locationId: p.locationId,
    shiftId: p.shiftId,
    dailyNumber: p.dailyNumber,
    businessDate: p.businessDate,
    channel: p.channel,
    status: 'draft',
    staffId: p.staffId,
    lines: [],
    payments: [],
    orderDiscountP: pence(0),
    serviceChargeP: pence(0),
    refundedP: pence(0),
    cancelReason: null,
    createdAt: event.createdAt,
  };
}

export function applyEvent(state: OrderState | null, event: AnyOrderEvent): OrderState {
  if (event.type === 'ORDER_CREATED') {
    if (state) throw new OrderReplayError(`Order ${event.orderId} created twice`);
    return initialState(event);
  }

  if (!state) {
    throw new OrderReplayError(`Event ${event.type} arrived before ORDER_CREATED`);
  }

  // Work on a shallow clone so callers never observe mutation mid-fold.
  const next: OrderState = { ...state, lines: [...state.lines], payments: [...state.payments] };

  switch (event.type) {
    case 'ORDER_CHANNEL_CHANGED': {
      next.channel = event.payload.channel;
      // VAT depends on channel, so every line is re-priced by the command
      // layer and supplied here. We do not recompute — the event carries the
      // authoritative repriced lines so replay never depends on menu data
      // that may have changed since.
      next.lines = event.payload.repricedLines.map((line, index) => ({
        lineId: next.lines[index]?.lineId ?? `${event.orderId}-${index}`,
        menuItemId: line.menuItemId,
        name: line.name,
        unitPriceP: line.unitPrice,
        quantity: line.quantity,
        vatRateBps: line.vatRateBps,
        modifiers: line.modifiers.map((m) => ({
          modifierId: m.modifierId,
          name: m.name,
          priceDeltaP: m.priceDelta,
        })),
        allergens: line.allergens,
        isVoided: next.lines[index]?.isVoided ?? false,
        voidReason: next.lines[index]?.voidReason ?? null,
        discountP: next.lines[index]?.discountP ?? pence(0),
      }));
      return next;
    }

    case 'ITEM_ADDED': {
      const { lineId, line } = event.payload;
      next.lines.push({
        lineId,
        menuItemId: line.menuItemId,
        name: line.name,
        unitPriceP: line.unitPrice,
        quantity: line.quantity,
        vatRateBps: line.vatRateBps,
        modifiers: line.modifiers.map((m) => ({
          modifierId: m.modifierId,
          name: m.name,
          priceDeltaP: m.priceDelta,
        })),
        allergens: line.allergens,
        isVoided: false,
        voidReason: null,
        discountP: pence(0),
      });
      return next;
    }

    case 'ITEM_VOIDED': {
      const line = requireLine(next, event.payload.lineId);
      // Flagged, never removed — a voided line is evidence, especially when
      // the void happens after payment.
      next.lines = next.lines.map((l) =>
        l.lineId === line.lineId
          ? { ...l, isVoided: true, voidReason: event.payload.reason }
          : l,
      );
      return next;
    }

    case 'ITEM_QUANTITY_CHANGED': {
      const line = requireLine(next, event.payload.lineId);
      next.lines = next.lines.map((l) =>
        l.lineId === line.lineId ? { ...l, quantity: event.payload.quantity } : l,
      );
      return next;
    }

    case 'DISCOUNT_APPLIED': {
      const { scope, amount } = event.payload;
      if (scope.kind === 'order') {
        next.orderDiscountP = pence(next.orderDiscountP + amount);
      } else {
        const line = requireLine(next, scope.lineId);
        next.lines = next.lines.map((l) =>
          l.lineId === line.lineId ? { ...l, discountP: pence(l.discountP + amount) } : l,
        );
      }
      return next;
    }

    case 'SERVICE_CHARGE_APPLIED': {
      next.serviceChargeP = pence(next.serviceChargeP + event.payload.amount);
      return next;
    }

    case 'ORDER_PLACED': {
      next.status = 'placed';
      return next;
    }

    case 'PAYMENT_TAKEN': {
      const p = event.payload;
      next.payments.push({
        paymentId: p.paymentId,
        method: p.method,
        amountP: p.amount,
        tenderedP: p.tendered ?? null,
        providerRef: p.providerRef ?? null,
      });
      return next;
    }

    case 'REFUND_ISSUED': {
      next.refundedP = pence(next.refundedP + event.payload.amount);
      next.status = 'refunded';
      return next;
    }

    case 'ORDER_CANCELLED': {
      next.status = 'cancelled';
      next.cancelReason = event.payload.reason;
      return next;
    }

    default:
      // Unknown event from a newer version — ignore rather than crash.
      return state;
  }
}

/**
 * Replay a full event log.
 *
 * Events are sorted by `sequence` per device, NOT by `createdAt` — till clocks
 * drift and staff change them (ADR-003). Ties across devices fall back to
 * deviceId for a deterministic total order.
 */
export function replay(events: readonly AnyOrderEvent[]): OrderState | null {
  const ordered = [...events].sort(
    (a, b) => a.sequence - b.sequence || a.deviceId.localeCompare(b.deviceId),
  );

  return ordered.reduce<OrderState | null>((state, event) => applyEvent(state, event), null);
}
