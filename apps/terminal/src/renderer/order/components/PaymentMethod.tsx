import { useMemo, useState } from 'react';
import { formatPence, pence } from '@pos/types';
import type { OrderState, OrderTotals } from '@pos/core';
import type { Staff } from '../useOrder';
import {
  ArrowLeftIcon,
  BanknoteIcon,
  CardIcon,
  CheckCircleIcon,
  DivideIcon,
  MailIcon,
  PrinterIcon,
  SmartphoneIcon,
  TicketPercentIcon,
} from '../icons';

/**
 * 01-TILL / 1.6 — Payment Method Selection.
 *
 * Summarises the live order (net / VAT / total), then lets the server pick a
 * method, a gratuity and a receipt output. Cash and Card route to their own
 * screens (1.7 / 1.8); Split reuses the split-bill utility. The tip is applied
 * as a real service charge so it lands in the order total before payment.
 */

const INK = '#1a2e30';
const MUTED = '#526b6e';
const BORDER = '#d3e2e3';
const TEAL = '#0d7377';
const TINT = '#e7f1f2';

type ReceiptOutput = 'print' | 'email' | 'sms';
/** UI-level choice; the domain only settles 'cash' | 'card' (voucher maps later). */
export type PayChoice = 'cash' | 'card' | 'voucher';

interface PaymentMethodProps {
  order: OrderState;
  totals: OrderTotals;
  staff: Staff;
  tableLabel?: string | undefined;
  online: boolean;
  onBack: () => void;
  onSplit: () => void;
  /** Method chosen + gratuity in pence. Parent routes to cash/card and pays. */
  onComplete: (method: PayChoice, tipP: number) => void;
}

const TIP_PCTS = [0, 10, 12.5, 15] as const;

export function PaymentMethod({
  order,
  totals,
  staff,
  tableLabel,
  online,
  onBack,
  onSplit,
  onComplete,
}: PaymentMethodProps) {
  const [method, setMethod] = useState<PayChoice>('cash');
  const [tipIndex, setTipIndex] = useState(0);
  const [receipt, setReceipt] = useState<ReceiptOutput>('print');

  const lines = useMemo(() => {
    const subById = new Map(totals.lines.map((l) => [l.lineId, l.subtotalP]));
    return order.lines
      .filter((l) => !l.isVoided)
      .map((l) => ({
        lineId: l.lineId,
        quantity: l.quantity,
        name:
          l.modifiers.length > 0
            ? `${l.name} (${l.modifiers.map((m) => m.name).join(', ')})`
            : l.name,
        subtotalP: subById.get(l.lineId) ?? 0,
      }));
  }, [order, totals]);

  const tipP = Math.round((totals.totalP * TIP_PCTS[tipIndex]!) / 100);
  const totalToPay = totals.totalP + tipP;

  const staffInitial = `${staff.name.split(' ')[0]} ${staff.name.split(' ')[1]?.[0] ?? ''}.`;

  return (
    <div className="flex h-full flex-col gap-8 p-12" style={{ backgroundColor: '#f2f6f6' }}>
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex h-12 w-12 items-center justify-center rounded-full border bg-white"
            style={{ borderColor: BORDER, color: INK }}
            aria-label="Back"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <p className="text-xl font-bold" style={{ color: INK }}>
              Select Payment Method
            </p>
            <p className="text-sm font-medium" style={{ color: MUTED }}>
              {tableLabel ?? 'Order'} • {staff.role}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div
            className="flex items-center gap-2 rounded-[20px] border bg-white px-4 py-2"
            style={{ borderColor: BORDER }}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
            <span className="text-sm font-semibold" style={{ color: INK }}>
              Staff: {staffInitial}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: online ? '#22c55e' : '#f59e0b' }}
            />
            <span className="text-sm font-semibold" style={{ color: MUTED }}>
              {online ? 'SYSTEM ONLINE' : 'OFFLINE — STILL TRADING'}
            </span>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-8">
        {/* Order summary */}
        <div
          className="flex h-full w-[560px] shrink-0 flex-col gap-6 rounded-xl border bg-white p-8"
          style={{ borderColor: BORDER }}
        >
          <p className="text-lg font-bold uppercase" style={{ color: INK }}>
            Order Summary
          </p>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
            {lines.map((l) => (
              <div key={l.lineId} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-7 min-w-7 items-center justify-center rounded px-1 text-sm font-bold"
                    style={{ backgroundColor: TINT, color: TEAL }}
                  >
                    {l.quantity}x
                  </span>
                  <span className="text-base font-medium" style={{ color: INK }}>
                    {l.name}
                  </span>
                </div>
                <span className="text-base font-semibold" style={{ color: INK }}>
                  {formatPence(pence(l.subtotalP))}
                </span>
              </div>
            ))}
          </div>
          <div className="h-px w-full" style={{ backgroundColor: BORDER }} />
          <div className="flex flex-col gap-3 text-base font-medium">
            <Row label="Subtotal" value={formatPence(pence(totals.netP))} />
            <Row label="VAT" value={formatPence(pence(totals.vatP))} />
            {tipP > 0 && <Row label="Gratuity" value={formatPence(pence(tipP))} />}
          </div>
          <div
            className="flex items-center justify-between rounded-lg p-5"
            style={{ backgroundColor: TINT, color: TEAL }}
          >
            <span className="text-[22px] font-bold">TOTAL TO PAY</span>
            <span className="text-[32px] font-extrabold">{formatPence(pence(totalToPay))}</span>
          </div>
        </div>

        {/* Options */}
        <div className="flex min-w-0 flex-1 flex-col gap-8 overflow-y-auto">
          <Section title="Select Payment Option">
            <div className="grid grid-cols-2 gap-4">
              <MethodCard
                active={method === 'cash'}
                label="Cash Payment"
                icon={<BanknoteIcon className="h-7 w-7" />}
                onClick={() => setMethod('cash')}
              />
              <MethodCard
                active={method === 'card'}
                label="Card Terminal"
                icon={<CardIcon className="h-7 w-7" />}
                onClick={() => setMethod('card')}
              />
              <MethodCard
                active={false}
                label="Split Bill"
                icon={<DivideIcon className="h-7 w-7" />}
                onClick={onSplit}
              />
              <MethodCard
                active={method === 'voucher'}
                label="Gift Card / Voucher"
                icon={<TicketPercentIcon className="h-7 w-7" />}
                onClick={() => setMethod('voucher')}
              />
            </div>
          </Section>

          <Section title="Add Gratuity (Tip)">
            <div className="flex gap-3">
              {TIP_PCTS.map((pct, i) => (
                <TipButton
                  key={pct}
                  active={tipIndex === i}
                  label={
                    pct === 0
                      ? 'No Tip'
                      : `${pct}% (${formatPence(pence(Math.round((totals.totalP * pct) / 100)))})`
                  }
                  onClick={() => setTipIndex(i)}
                />
              ))}
            </div>
          </Section>

          <Section title="Receipt Output">
            <div className="flex gap-3">
              <ReceiptButton
                active={receipt === 'print'}
                icon={<PrinterIcon className="h-5 w-5" />}
                label="Print Receipt"
                onClick={() => setReceipt('print')}
              />
              <ReceiptButton
                active={receipt === 'email'}
                icon={<MailIcon className="h-5 w-5" />}
                label="Email Receipt"
                onClick={() => setReceipt('email')}
              />
              <ReceiptButton
                active={receipt === 'sms'}
                icon={<SmartphoneIcon className="h-5 w-5" />}
                label="SMS Receipt"
                onClick={() => setReceipt('sms')}
              />
            </div>
          </Section>

          <button
            type="button"
            onClick={() => onComplete(method, tipP)}
            className="mt-auto flex h-[72px] w-full items-center justify-center gap-3 rounded-[10px] text-lg font-semibold text-white"
            style={{ backgroundColor: TEAL }}
          >
            <CheckCircleIcon className="h-6 w-6" />
            {method === 'cash'
              ? 'CONTINUE TO CASH'
              : method === 'card'
                ? 'CHARGE CARD'
                : 'COMPLETE TRANSACTION'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: '#526b6e' }}>{label}</span>
      <span style={{ color: '#1a2e30' }}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-base font-bold uppercase" style={{ color: MUTED }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function MethodCard({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-40 flex-col items-center justify-center gap-4 rounded-xl p-6"
      style={
        active
          ? { backgroundColor: TINT, border: `2px solid ${TEAL}` }
          : { backgroundColor: 'white', border: `1px solid ${BORDER}` }
      }
    >
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: active ? TEAL : TINT, color: active ? 'white' : TEAL }}
      >
        {icon}
      </span>
      <span className="text-xl font-bold" style={{ color: active ? TEAL : INK }}>
        {label}
      </span>
    </button>
  );
}

function TipButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-16 flex-1 items-center justify-center rounded-[10px] text-lg font-semibold"
      style={
        active
          ? { backgroundColor: TEAL, color: 'white' }
          : { backgroundColor: 'white', border: `1px solid ${BORDER}`, color: INK }
      }
    >
      {label}
    </button>
  );
}

function ReceiptButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-16 flex-1 items-center justify-center gap-2.5 rounded-[10px] text-base font-semibold"
      style={
        active
          ? { backgroundColor: TINT, border: `1px solid ${TEAL}`, color: TEAL }
          : { backgroundColor: 'white', border: `1px solid ${BORDER}`, color: INK }
      }
    >
      {icon}
      {label}
    </button>
  );
}
