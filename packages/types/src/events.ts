import type { Pence, VatRateBps } from './money.js';
import type { AllergenTag } from './allergens.js';

/** Where the order is consumed. Drives VAT resolution — see ADR-002. */
export type OrderChannel = 'dine_in' | 'takeaway' | 'delivery';

export type OrderStatus =
  | 'draft' // being built at the till, not yet sent
  | 'placed' // sent to kitchen
  | 'paid'
  | 'refunded'
  | 'cancelled';

export type PaymentMethod = 'cash' | 'card';

export const ORDER_EVENT_TYPES = [
  'ORDER_CREATED',
  'ORDER_CHANNEL_CHANGED',
  'ITEM_ADDED',
  'ITEM_VOIDED',
  'ITEM_QUANTITY_CHANGED',
  'DISCOUNT_APPLIED',
  'SERVICE_CHARGE_APPLIED',
  'ORDER_PLACED',
  'PAYMENT_TAKEN',
  'REFUND_ISSUED',
  'ORDER_CANCELLED',
] as const;

export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

/** A line item's allergen + VAT state frozen at the moment it was added. */
export interface LineSnapshot {
  menuItemId: string;
  name: string;
  unitPrice: Pence;
  /** Resolved from the order channel at add-time and frozen. See ADR-002. */
  vatRateBps: VatRateBps;
  quantity: number;
  modifiers: Array<{
    modifierId: string;
    name: string;
    priceDelta: Pence;
  }>;
  /** Union of item + modifier allergens, computed at add-time. */
  allergens: AllergenTag[];
}

export interface OrderEventPayloads {
  ORDER_CREATED: {
    locationId: string;
    channel: OrderChannel;
    dailyNumber: number;
    businessDate: string; // YYYY-MM-DD, trading day not calendar day
    shiftId: string;
    staffId: string;
  };
  ORDER_CHANNEL_CHANGED: {
    channel: OrderChannel;
    /** Lines re-priced as a result, since VAT depends on channel. */
    repricedLines: LineSnapshot[];
    staffId: string;
  };
  ITEM_ADDED: { lineId: string; line: LineSnapshot };
  ITEM_VOIDED: {
    lineId: string;
    /** Voids after payment are an audit concern; reason is mandatory. */
    reason: string;
    staffId: string;
  };
  ITEM_QUANTITY_CHANGED: { lineId: string; quantity: number; staffId: string };
  DISCOUNT_APPLIED: {
    discountId: string;
    description: string;
    amount: Pence;
    /** Whole-order or a single line. Changes the VAT base either way. */
    scope: { kind: 'order' } | { kind: 'line'; lineId: string };
    staffId: string;
  };
  SERVICE_CHARGE_APPLIED: { amount: Pence; description: string };
  ORDER_PLACED: { staffId: string };
  PAYMENT_TAKEN: {
    paymentId: string;
    method: PaymentMethod;
    amount: Pence;
    /** Cash only. Used to compute change; change itself is derived. */
    tendered?: Pence;
    /** Card only — provider token/reference. NEVER a card number. */
    providerRef?: string;
    staffId: string;
  };
  REFUND_ISSUED: {
    refundId: string;
    amount: Pence;
    reason: string;
    staffId: string;
  };
  ORDER_CANCELLED: { reason: string; staffId: string };
}

/**
 * An append-only order event. Never updated, never deleted — corrections are
 * new events. This is both the sync mechanism and the HMRC audit trail.
 */
export interface OrderEvent<T extends OrderEventType = OrderEventType> {
  /** Client-generated UUIDv4. Doubles as the cloud idempotency key (ADR-004). */
  id: string;
  orderId: string;
  type: T;
  payload: OrderEventPayloads[T];
  /** Till wall-clock. Informational — do NOT order by this. See ADR-003. */
  createdAt: string;
  deviceId: string;
  /** Per-device monotonic counter. Replay by (deviceId, sequence). */
  sequence: number;
}

export type AnyOrderEvent = {
  [T in OrderEventType]: OrderEvent<T>;
}[OrderEventType];
