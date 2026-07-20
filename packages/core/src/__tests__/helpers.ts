import {
  pence,
  type AnyOrderEvent,
  type LineSnapshot,
  type OrderChannel,
  type OrderEventPayloads,
  type OrderEventType,
  type VatRateBps,
  VAT_STANDARD,
} from '@pos/types';

/** Test-facing line shape: plain numbers, branded by the builder. */
export interface TestLine {
  unitPrice: number;
  menuItemId?: string;
  name?: string;
  vatRateBps?: VatRateBps;
  quantity?: number;
  modifiers?: Array<{ modifierId: string; name: string; priceDelta: number }>;
  allergens?: LineSnapshot['allergens'];
}

/**
 * Test event builder. Auto-increments `sequence` so tests read as a story
 * rather than a pile of bookkeeping.
 */
export function eventLog(orderId = 'ord-1', deviceId = 'dev-1') {
  let sequence = 0;
  const events: AnyOrderEvent[] = [];

  const push = <T extends OrderEventType>(type: T, payload: OrderEventPayloads[T]) => {
    sequence += 1;
    events.push({
      id: `evt-${sequence}`,
      orderId,
      type,
      payload,
      createdAt: `2026-07-20T12:00:${String(sequence).padStart(2, '0')}Z`,
      deviceId,
      sequence,
    } as AnyOrderEvent);
    return api;
  };

  const api = {
    created(channel: OrderChannel = 'dine_in') {
      return push('ORDER_CREATED', {
        locationId: 'loc-1',
        channel,
        dailyNumber: 42,
        businessDate: '2026-07-20',
        shiftId: 'shift-1',
        staffId: 'staff-1',
      });
    },
    itemAdded(lineId: string, line: TestLine) {
      return push('ITEM_ADDED', {
        lineId,
        line: {
          menuItemId: line.menuItemId ?? 'item-1',
          name: line.name ?? 'Test item',
          unitPrice: pence(line.unitPrice),
          vatRateBps: line.vatRateBps ?? VAT_STANDARD,
          quantity: line.quantity ?? 1,
          // Tests pass plain numbers; brand them here rather than casting at
          // every call site.
          modifiers: (line.modifiers ?? []).map((m) => ({
            modifierId: m.modifierId,
            name: m.name,
            priceDelta: pence(m.priceDelta),
          })),
          allergens: line.allergens ?? [],
        },
      });
    },
    itemVoided(lineId: string, reason = 'Customer changed mind') {
      return push('ITEM_VOIDED', { lineId, reason, staffId: 'staff-1' });
    },
    quantityChanged(lineId: string, quantity: number) {
      return push('ITEM_QUANTITY_CHANGED', { lineId, quantity, staffId: 'staff-1' });
    },
    orderDiscount(amount: number, description = 'Manager discount') {
      return push('DISCOUNT_APPLIED', {
        discountId: `disc-${sequence + 1}`,
        description,
        amount: pence(amount),
        scope: { kind: 'order' },
        staffId: 'staff-1',
      });
    },
    lineDiscount(lineId: string, amount: number) {
      return push('DISCOUNT_APPLIED', {
        discountId: `disc-${sequence + 1}`,
        description: 'Line discount',
        amount: pence(amount),
        scope: { kind: 'line', lineId },
        staffId: 'staff-1',
      });
    },
    serviceCharge(amount: number) {
      return push('SERVICE_CHARGE_APPLIED', {
        amount: pence(amount),
        description: 'Optional service charge',
      });
    },
    placed() {
      return push('ORDER_PLACED', { staffId: 'staff-1' });
    },
    cashPayment(amount: number, tendered?: number) {
      return push('PAYMENT_TAKEN', {
        paymentId: `pay-${sequence + 1}`,
        method: 'cash',
        amount: pence(amount),
        ...(tendered !== undefined ? { tendered: pence(tendered) } : {}),
        staffId: 'staff-1',
      });
    },
    refund(amount: number, reason = 'Wrong order') {
      return push('REFUND_ISSUED', {
        refundId: `ref-${sequence + 1}`,
        amount: pence(amount),
        reason,
        staffId: 'staff-1',
      });
    },
    cancelled(reason = 'Walked out') {
      return push('ORDER_CANCELLED', { reason, staffId: 'staff-1' });
    },
    build(): AnyOrderEvent[] {
      return events;
    },
  };

  return api;
}

export const RATES = { standard: VAT_STANDARD as VatRateBps, zero: 0 as VatRateBps };
