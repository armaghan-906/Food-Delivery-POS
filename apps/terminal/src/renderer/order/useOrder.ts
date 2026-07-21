import { useCallback, useMemo, useRef, useState } from 'react';
import {
  addItem as cmdAddItem,
  applyDiscount as cmdApplyDiscount,
  changeQuantity as cmdChangeQuantity,
  createOrder as cmdCreateOrder,
  voidItem as cmdVoidItem,
  takeCashPayment as cmdTakeCashPayment,
  issueRefund as cmdIssueRefund,
  computeTotals,
  replay,
} from '@pos/core';
import type {
  CommandContext,
  MenuItemInput,
  OrderState,
  OrderTotals,
  SelectedModifierInput,
  StaffRole,
} from '@pos/core';
import { pence } from '@pos/types';
import type { AnyOrderEvent, OrderChannel } from '@pos/types';
import { itemById, type CatalogItem } from './catalog';

/**
 * The till's order engine, in the renderer.
 *
 * It holds nothing but the append-only event log; current state and every
 * total are derived by folding that log with the same pure functions the
 * backend uses (`replay`, `computeTotals`). Editing the order only ever means
 * appending an event — exactly the model the local DB and sync will persist.
 */

const DEVICE_ID = 'till-01';
const LOCATION_ID = 'loc-demo-1';
const SHIFT_ID = 'shift-demo';

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
}

/** Stand-in for the logged-in session until the login screen is wired. */
export const ACTIVE_STAFF: Staff = {
  id: 'staff-riley',
  name: 'Riley Chen',
  role: 'supervisor',
};

const businessDate = new Date().toISOString().slice(0, 10);

function toMenuInput(item: CatalogItem): MenuItemInput {
  return {
    id: item.id,
    name: item.name,
    priceP: pence(item.priceP),
    vatRateEatInBps: item.vatRateEatInBps,
    vatRateTakeawayBps: item.vatRateTakeawayBps,
    allergens: (item.allergens ?? []).map((a) => ({
      allergen: a.allergen,
      presence: a.presence,
    })),
  };
}

export interface AddItemOptions {
  modifiers?: SelectedModifierInput[];
  quantity?: number;
}

/** A manager who authorised an escalated action (discount / void). */
export interface Authorizer {
  id: string;
  role: StaffRole;
}

export type DiscountScope = { kind: 'order' } | { kind: 'line'; lineId: string };

/** A parked order — its full event log, snapshotted so it can be recalled. */
export interface HeldOrder {
  id: string;
  label: string;
  channel: OrderChannel;
  events: AnyOrderEvent[];
  heldAt: string;
  itemCount: number;
  totalP: number;
}

export interface UseOrder {
  order: OrderState;
  totals: OrderTotals;
  staff: Staff;
  addItem: (item: CatalogItem, opts?: AddItemOptions) => void;
  incQty: (lineId: string) => void;
  decQty: (lineId: string) => void;
  voidLine: (lineId: string, reason?: string, authorizer?: Authorizer) => void;
  /** Apply a discount (needs order.discount — pass an authorizer to escalate). */
  applyDiscount: (
    amountP: number,
    description: string,
    scope: DiscountScope,
    authorizer?: Authorizer,
  ) => void;
  setChannel: (channel: OrderChannel) => void;
  /** Take a cash payment (used by split bill and the payment flow). `tenderedP`
   *  is what the customer handed over (for change); defaults to the amount.
   *  Rejected silently if it would exceed what's still owed. */
  payCash: (amountP: number, tenderedP?: number) => void;
  /** Add a gratuity as a service charge, so it lands in the order total. */
  addTip: (amountP: number, description?: string) => void;
  /** Record an approved card payment. `providerRef` is the auth/token — never
   *  a card number (PCI-DSS). Clamped to what's still outstanding. */
  payCard: (amountP: number, providerRef: string) => void;
  /** Issue a refund (needs payment.refund — pass an authorizer to escalate). */
  issueRefund: (amountP: number, reason: string, authorizer?: Authorizer) => void;
  /** Parked orders (1.13). */
  heldOrders: HeldOrder[];
  /** Park the current order and open a fresh one. No-op if it has no items. */
  holdCurrent: (label?: string) => void;
  /** Reload a parked order as the current one, removing it from the held list. */
  recallHeld: (id: string) => void;
  voidHeld: (id: string) => void;
}

export function useOrder(staff: Staff = ACTIVE_STAFF): UseOrder {
  // Per-device monotonic sequence. Only needs to increase; never reset.
  const seqRef = useRef(0);

  const ctx: CommandContext = useMemo(
    () => ({
      deviceId: DEVICE_ID,
      staffId: staff.id,
      staffRole: staff.role,
      now: () => new Date(),
      newId: () => crypto.randomUUID(),
      nextSequence: () => (seqRef.current += 1),
    }),
    [staff.id, staff.role],
  );

  const newOrderEvents = useCallback(
    (channel: OrderChannel, dailyNumber: number): AnyOrderEvent[] => [
      cmdCreateOrder(ctx, {
        orderId: crypto.randomUUID(),
        locationId: LOCATION_ID,
        shiftId: SHIFT_ID,
        channel,
        dailyNumber,
        businessDate,
      }),
    ],
    [ctx],
  );

  const [events, setEvents] = useState<AnyOrderEvent[]>(() =>
    newOrderEvents('dine_in', 42),
  );
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);

  // `replay` can only return null for an empty log; ours always opens with
  // ORDER_CREATED, so the order is always present.
  const order = useMemo(() => replay(events) as OrderState, [events]);
  const totals = useMemo(() => computeTotals(order), [order]);

  const addItem = useCallback(
    (item: CatalogItem, opts?: AddItemOptions) => {
      setEvents((prev) => {
        const current = replay(prev);
        if (!current) return prev;
        return [
          ...prev,
          cmdAddItem(ctx, current, {
            item: toMenuInput(item),
            ...(opts?.modifiers ? { modifiers: opts.modifiers } : {}),
            ...(opts?.quantity ? { quantity: opts.quantity } : {}),
          }),
        ];
      });
    },
    [ctx],
  );

  const incQty = useCallback(
    (lineId: string) => {
      setEvents((prev) => {
        const current = replay(prev);
        const line = current?.lines.find((l) => l.lineId === lineId);
        if (!current || !line) return prev;
        return [...prev, cmdChangeQuantity(ctx, current, lineId, line.quantity + 1)];
      });
    },
    [ctx],
  );

  const decQty = useCallback(
    (lineId: string) => {
      setEvents((prev) => {
        const current = replay(prev);
        const line = current?.lines.find((l) => l.lineId === lineId);
        if (!current || !line) return prev;
        // Dropping below one is a removal — a void, so it stays in the audit trail.
        const event =
          line.quantity <= 1
            ? cmdVoidItem(ctx, current, lineId, 'Removed before sending')
            : cmdChangeQuantity(ctx, current, lineId, line.quantity - 1);
        return [...prev, event];
      });
    },
    [ctx],
  );

  // Run a command as the current staff, or as a manager who authorised it.
  const ctxWith = useCallback(
    (auth?: Authorizer): CommandContext =>
      auth ? { ...ctx, staffId: auth.id, staffRole: auth.role } : ctx,
    [ctx],
  );

  const voidLine = useCallback(
    (lineId: string, reason = 'Voided at till', authorizer?: Authorizer) => {
      setEvents((prev) => {
        const current = replay(prev);
        if (!current) return prev;
        try {
          return [...prev, cmdVoidItem(ctxWith(authorizer), current, lineId, reason)];
        } catch {
          return prev;
        }
      });
    },
    [ctxWith],
  );

  const applyDiscount = useCallback(
    (amountP: number, description: string, scope: DiscountScope, authorizer?: Authorizer) => {
      if (amountP <= 0) return;
      setEvents((prev) => {
        const current = replay(prev);
        if (!current) return prev;
        try {
          return [
            ...prev,
            cmdApplyDiscount(ctxWith(authorizer), current, {
              amountP: pence(amountP),
              description,
              scope,
            }),
          ];
        } catch {
          // Permission denied or amount exceeds total — ignore.
          return prev;
        }
      });
    },
    [ctxWith],
  );

  // Phase 1 has no channel-change command (VAT is frozen at add-time, ADR-002).
  // Switching channel therefore re-opens the order under the new channel and
  // re-adds the live lines, so each line's VAT is re-resolved correctly.
  const setChannel = useCallback(
    (channel: OrderChannel) => {
      setEvents((prev) => {
        const current = replay(prev);
        if (!current || current.channel === channel) return prev;

        let next = newOrderEvents(channel, current.dailyNumber);
        for (const line of current.lines.filter((l) => !l.isVoided)) {
          const item = itemById(line.menuItemId);
          if (!item) continue;
          const state = replay(next) as OrderState;
          next = [
            ...next,
            cmdAddItem(ctx, state, { item: toMenuInput(item), quantity: line.quantity }),
          ];
        }
        return next;
      });
    },
    [ctx, newOrderEvents],
  );

  const payCash = useCallback(
    (amountP: number, tenderedP?: number) => {
      setEvents((prev) => {
        const current = replay(prev);
        if (!current || amountP <= 0) return prev;
        try {
          const event = cmdTakeCashPayment(ctx, current, {
            amountP: pence(amountP),
            tenderedP: pence(Math.max(tenderedP ?? amountP, amountP)),
          });
          return [...prev, event];
        } catch {
          // e.g. the amount exceeds what's still outstanding — ignore.
          return prev;
        }
      });
    },
    [ctx],
  );

  const addTip = useCallback(
    (amountP: number, description = 'Gratuity') => {
      if (amountP <= 0) return;
      setEvents((prev) => {
        const current = replay(prev);
        if (!current) return prev;
        // No service-charge command exists yet; the event is simple and the
        // reducer already handles it (SERVICE_CHARGE_APPLIED).
        const event: AnyOrderEvent = {
          id: ctx.newId(),
          orderId: current.orderId,
          type: 'SERVICE_CHARGE_APPLIED',
          payload: { amount: pence(amountP), description },
          createdAt: ctx.now().toISOString(),
          deviceId: DEVICE_ID,
          sequence: ctx.nextSequence(),
        };
        return [...prev, event];
      });
    },
    [ctx],
  );

  const payCard = useCallback(
    (amountP: number, providerRef: string) => {
      if (amountP <= 0) return;
      setEvents((prev) => {
        const current = replay(prev);
        if (!current) return prev;
        const outstanding = computeTotals(current).outstandingP;
        const amount = Math.min(amountP, outstanding);
        if (amount <= 0) return prev;
        // No card command yet; construct the event directly (reducer handles it).
        const event: AnyOrderEvent = {
          id: ctx.newId(),
          orderId: current.orderId,
          type: 'PAYMENT_TAKEN',
          payload: {
            paymentId: ctx.newId(),
            method: 'card',
            amount: pence(amount),
            providerRef,
            staffId: staff.id,
          },
          createdAt: ctx.now().toISOString(),
          deviceId: DEVICE_ID,
          sequence: ctx.nextSequence(),
        };
        return [...prev, event];
      });
    },
    [ctx, staff.id],
  );

  const issueRefund = useCallback(
    (amountP: number, reason: string, authorizer?: Authorizer) => {
      if (amountP <= 0) return;
      setEvents((prev) => {
        const current = replay(prev);
        if (!current) return prev;
        try {
          return [...prev, cmdIssueRefund(ctxWith(authorizer), current, pence(amountP), reason)];
        } catch {
          // Permission denied, or amount exceeds what was actually paid.
          return prev;
        }
      });
    },
    [ctxWith],
  );

  const holdCurrent = useCallback(
    (label?: string) => {
      const active = order.lines.filter((l) => !l.isVoided);
      if (active.length === 0) return; // nothing to park
      const held: HeldOrder = {
        id: crypto.randomUUID(),
        label: label ?? (order.channel === 'dine_in' ? `Order #${order.dailyNumber}` : order.channel),
        channel: order.channel,
        events,
        heldAt: new Date().toISOString(),
        itemCount: active.length,
        totalP: totals.totalP,
      };
      setHeldOrders((h) => [held, ...h]);
      setEvents(newOrderEvents(order.channel, order.dailyNumber + 1));
    },
    [order, totals, events, newOrderEvents],
  );

  const recallHeld = useCallback(
    (id: string) => {
      const found = heldOrders.find((h) => h.id === id);
      if (!found) return;
      setEvents(found.events);
      setHeldOrders((h) => h.filter((x) => x.id !== id));
    },
    [heldOrders],
  );

  const voidHeld = useCallback(
    (id: string) => setHeldOrders((h) => h.filter((x) => x.id !== id)),
    [],
  );

  return {
    order,
    totals,
    staff,
    addItem,
    incQty,
    decQty,
    voidLine,
    applyDiscount,
    setChannel,
    payCash,
    addTip,
    payCard,
    issueRefund,
    heldOrders,
    holdCurrent,
    recallHeld,
    voidHeld,
  };
}
