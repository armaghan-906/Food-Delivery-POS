import {
  pence,
  type AllergenTag,
  type AnyOrderEvent,
  type OrderChannel,
  type OrderEvent,
  type OrderEventPayloads,
  type OrderEventType,
  type Pence,
  type VatRateBps,
} from '@pos/types';
import { can, type Permission, type StaffRole } from '../auth/permissions.js';
import { mergeAllergens } from '../allergens.js';
import { resolveVatRateBps } from '../vat.js';
import type { OrderState } from './state.js';
import { computeTotals } from './totals.js';

/**
 * The command layer: turn an intent ("add this burger") into events.
 *
 * Commands VALIDATE and then EMIT. They never apply — the caller appends the
 * returned events to the log and folds them with the reducer. Keeping those
 * separate means a command can be rejected without leaving partial state, and
 * the reducer stays a total function over events that were already checked.
 *
 * Impure inputs (clock, UUIDs, the device sequence counter) arrive through
 * `CommandContext` rather than being called directly, so this whole module
 * stays deterministic and testable.
 */

export interface CommandContext {
  deviceId: string;
  staffId: string;
  staffRole: StaffRole;
  now: () => Date;
  newId: () => string;
  /** Per-device monotonic counter. See ADR-003. */
  nextSequence: () => number;
}

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

export class PermissionDeniedError extends CommandError {
  constructor(
    readonly permission: Permission,
    readonly role: StaffRole,
  ) {
    super(`Role '${role}' may not perform '${permission}'`);
    this.name = 'PermissionDeniedError';
  }
}

function requirePermission(ctx: CommandContext, permission: Permission): void {
  if (!can(ctx.staffRole, permission)) {
    throw new PermissionDeniedError(permission, ctx.staffRole);
  }
}

function buildEvent<T extends OrderEventType>(
  ctx: CommandContext,
  orderId: string,
  type: T,
  payload: OrderEventPayloads[T],
): OrderEvent<T> {
  return {
    id: ctx.newId(),
    orderId,
    type,
    payload,
    createdAt: ctx.now().toISOString(),
    deviceId: ctx.deviceId,
    sequence: ctx.nextSequence(),
  };
}

/** A menu item as the command layer needs it — the shape read from local-db. */
export interface MenuItemInput {
  id: string;
  name: string;
  priceP: Pence;
  vatRateEatInBps: VatRateBps;
  vatRateTakeawayBps: VatRateBps;
  allergens: AllergenTag[];
}

export interface SelectedModifierInput {
  modifierId: string;
  name: string;
  priceDeltaP: Pence;
  allergens: AllergenTag[];
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export interface CreateOrderInput {
  orderId: string;
  locationId: string;
  shiftId: string;
  channel: OrderChannel;
  dailyNumber: number;
  businessDate: string;
}

export function createOrder(ctx: CommandContext, input: CreateOrderInput): AnyOrderEvent {
  requirePermission(ctx, 'order.create');

  if (input.dailyNumber < 1) {
    throw new CommandError('Daily order number must start at 1');
  }

  return buildEvent(ctx, input.orderId, 'ORDER_CREATED', {
    locationId: input.locationId,
    channel: input.channel,
    dailyNumber: input.dailyNumber,
    businessDate: input.businessDate,
    shiftId: input.shiftId,
    staffId: ctx.staffId,
  }) as AnyOrderEvent;
}

export interface AddItemInput {
  item: MenuItemInput;
  modifiers?: SelectedModifierInput[];
  quantity?: number;
}

/**
 * Add a line.
 *
 * Resolves VAT from the ORDER'S channel and freezes it onto the line, along
 * with the price, name and the union of item + modifier allergens. Freezing
 * means a historical order always re-renders as it was actually sold, even
 * after the menu changes (ADR-002).
 */
export function addItem(
  ctx: CommandContext,
  order: OrderState,
  input: AddItemInput,
): AnyOrderEvent {
  assertOrderOpen(order);

  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new CommandError(`Quantity must be a positive integer, received ${quantity}`);
  }

  const modifiers = input.modifiers ?? [];
  const vatRateBps = resolveVatRateBps(input.item, order.channel);

  // A modifier can introduce an allergen the base item does not have.
  const allergens = mergeAllergens(
    input.item.allergens,
    ...modifiers.map((m) => m.allergens),
  );

  return buildEvent(ctx, order.orderId, 'ITEM_ADDED', {
    lineId: ctx.newId(),
    line: {
      menuItemId: input.item.id,
      name: input.item.name,
      unitPrice: input.item.priceP,
      vatRateBps,
      quantity,
      modifiers: modifiers.map((m) => ({
        modifierId: m.modifierId,
        name: m.name,
        priceDelta: m.priceDeltaP,
      })),
      allergens,
    },
  }) as AnyOrderEvent;
}

/**
 * Void a line.
 *
 * Voiding AFTER payment needs a supervisor — that is money leaving the till,
 * and it is where till fraud concentrates. Before payment it is routine.
 */
export function voidItem(
  ctx: CommandContext,
  order: OrderState,
  lineId: string,
  reason: string,
): AnyOrderEvent {
  const line = order.lines.find((l) => l.lineId === lineId);
  if (!line) throw new CommandError(`Unknown line ${lineId}`);
  if (line.isVoided) throw new CommandError(`Line ${lineId} is already voided`);

  const hasPayment = order.payments.length > 0;
  requirePermission(
    ctx,
    hasPayment ? 'order.void_item_after_payment' : 'order.void_item_before_payment',
  );

  // Reason is mandatory — a void with no explanation is useless in an audit.
  if (!reason.trim()) {
    throw new CommandError('A void reason is required');
  }

  return buildEvent(ctx, order.orderId, 'ITEM_VOIDED', {
    lineId,
    reason: reason.trim(),
    staffId: ctx.staffId,
  }) as AnyOrderEvent;
}

export function changeQuantity(
  ctx: CommandContext,
  order: OrderState,
  lineId: string,
  quantity: number,
): AnyOrderEvent {
  assertOrderOpen(order);

  const line = order.lines.find((l) => l.lineId === lineId);
  if (!line) throw new CommandError(`Unknown line ${lineId}`);
  if (line.isVoided) throw new CommandError('Cannot change quantity of a voided line');

  if (!Number.isInteger(quantity) || quantity < 1) {
    // Reducing to zero is a void, which needs a reason and a permission check.
    throw new CommandError('Quantity must be at least 1 — void the line instead');
  }

  return buildEvent(ctx, order.orderId, 'ITEM_QUANTITY_CHANGED', {
    lineId,
    quantity,
    staffId: ctx.staffId,
  }) as AnyOrderEvent;
}

export interface DiscountInput {
  amountP: Pence;
  description: string;
  scope: { kind: 'order' } | { kind: 'line'; lineId: string };
}

export function applyDiscount(
  ctx: CommandContext,
  order: OrderState,
  input: DiscountInput,
): AnyOrderEvent {
  requirePermission(ctx, 'order.discount');
  assertOrderOpen(order);

  if (input.amountP <= 0) {
    throw new CommandError('Discount must be positive');
  }

  const totals = computeTotals(order);
  if (input.amountP > totals.totalP) {
    throw new CommandError(
      `Discount of ${input.amountP}p exceeds order total of ${totals.totalP}p`,
    );
  }

  if (input.scope.kind === 'line') {
    const { lineId } = input.scope;
    const line = order.lines.find((l) => l.lineId === lineId);
    if (!line) throw new CommandError(`Unknown line ${lineId}`);
    if (line.isVoided) throw new CommandError('Cannot discount a voided line');
  }

  return buildEvent(ctx, order.orderId, 'DISCOUNT_APPLIED', {
    discountId: ctx.newId(),
    description: input.description,
    amount: input.amountP,
    scope: input.scope,
    staffId: ctx.staffId,
  }) as AnyOrderEvent;
}

export function placeOrder(ctx: CommandContext, order: OrderState): AnyOrderEvent {
  if (order.status !== 'draft') {
    throw new CommandError(`Cannot place an order with status '${order.status}'`);
  }
  if (order.lines.filter((l) => !l.isVoided).length === 0) {
    throw new CommandError('Cannot place an empty order');
  }

  return buildEvent(ctx, order.orderId, 'ORDER_PLACED', {
    staffId: ctx.staffId,
  }) as AnyOrderEvent;
}

export interface CashPaymentInput {
  amountP: Pence;
  tenderedP: Pence;
}

/**
 * Take a cash payment.
 *
 * Change is derived by the totals engine, never stored — a stored change value
 * is a second source of truth that can disagree with the arithmetic.
 */
export function takeCashPayment(
  ctx: CommandContext,
  order: OrderState,
  input: CashPaymentInput,
): AnyOrderEvent {
  requirePermission(ctx, 'payment.take');

  if (order.status === 'cancelled') {
    throw new CommandError('Cannot take payment on a cancelled order');
  }
  if (input.amountP <= 0) {
    throw new CommandError('Payment amount must be positive');
  }
  if (input.tenderedP < input.amountP) {
    throw new CommandError('Tendered amount is less than the payment amount');
  }

  const totals = computeTotals(order);
  if (input.amountP > totals.outstandingP) {
    throw new CommandError(
      `Payment of ${input.amountP}p exceeds outstanding ${totals.outstandingP}p`,
    );
  }

  return buildEvent(ctx, order.orderId, 'PAYMENT_TAKEN', {
    paymentId: ctx.newId(),
    method: 'cash',
    amount: input.amountP,
    tendered: input.tenderedP,
    staffId: ctx.staffId,
  }) as AnyOrderEvent;
}

export function cancelOrder(
  ctx: CommandContext,
  order: OrderState,
  reason: string,
): AnyOrderEvent {
  requirePermission(ctx, 'order.cancel');

  if (order.payments.length > 0) {
    throw new CommandError('Refund the payment before cancelling a paid order');
  }
  if (!reason.trim()) {
    throw new CommandError('A cancellation reason is required');
  }

  return buildEvent(ctx, order.orderId, 'ORDER_CANCELLED', {
    reason: reason.trim(),
    staffId: ctx.staffId,
  }) as AnyOrderEvent;
}

export function issueRefund(
  ctx: CommandContext,
  order: OrderState,
  amountP: Pence,
  reason: string,
): AnyOrderEvent {
  requirePermission(ctx, 'payment.refund');

  const totals = computeTotals(order);
  if (amountP <= 0) throw new CommandError('Refund must be positive');
  if (amountP > totals.paidP) {
    throw new CommandError(`Cannot refund ${amountP}p — only ${totals.paidP}p was paid`);
  }
  if (!reason.trim()) throw new CommandError('A refund reason is required');

  return buildEvent(ctx, order.orderId, 'REFUND_ISSUED', {
    refundId: ctx.newId(),
    amount: amountP,
    reason: reason.trim(),
    staffId: ctx.staffId,
  }) as AnyOrderEvent;
}

function assertOrderOpen(order: OrderState): void {
  if (order.status === 'cancelled') {
    throw new CommandError('Order is cancelled');
  }
  if (order.status === 'refunded') {
    throw new CommandError('Order is refunded');
  }
}

/** Re-exported so callers can build a zero without importing @pos/types. */
export const ZERO: Pence = pence(0);
