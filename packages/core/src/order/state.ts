import type {
  AllergenTag,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  Pence,
  VatRateBps,
} from '@pos/types';

/** A line as it currently stands, after every event affecting it. */
export interface OrderLineState {
  lineId: string;
  menuItemId: string;
  name: string;
  /** VAT-inclusive unit price, frozen at add-time. */
  unitPriceP: Pence;
  quantity: number;
  /** Resolved from the channel at add-time and frozen. ADR-002. */
  vatRateBps: VatRateBps;
  modifiers: Array<{ modifierId: string; name: string; priceDeltaP: Pence }>;
  allergens: AllergenTag[];
  /** Voided lines stay visible — removing them would destroy the audit trail. */
  isVoided: boolean;
  voidReason: string | null;
  /** Line-scoped discount, VAT-inclusive. */
  discountP: Pence;
}

export interface OrderPaymentState {
  paymentId: string;
  method: PaymentMethod;
  amountP: Pence;
  tenderedP: Pence | null;
  providerRef: string | null;
}

/** The order as folded from its event log. Never constructed directly. */
export interface OrderState {
  orderId: string;
  locationId: string;
  shiftId: string;
  dailyNumber: number;
  businessDate: string;
  channel: OrderChannel;
  status: OrderStatus;
  staffId: string;

  lines: OrderLineState[];
  payments: OrderPaymentState[];

  /** Whole-order discount, VAT-inclusive. */
  orderDiscountP: Pence;
  serviceChargeP: Pence;

  refundedP: Pence;
  cancelReason: string | null;
  createdAt: string;
}
