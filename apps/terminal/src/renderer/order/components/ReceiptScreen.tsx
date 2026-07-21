import { formatPence, pence } from '@pos/types';
import type { OrderState, OrderTotals } from '@pos/core';
import type { Staff } from '../useOrder';
import { PrinterIcon } from '../icons';

/**
 * 01-TILL / 1.11 — Receipt Preview.
 *
 * The thermal receipt is rendered entirely from the real order: line items with
 * their frozen modifiers, the engine's per-rate VAT breakdown, and the actual
 * payment / tendered / change. Print, email and SMS delivery are stubs until the
 * hardware and comms integrations land.
 */

const INK = '#1e2525';
const MUTED = '#515e5e';
const BORDER = '#d2dbdb';
const TEAL = '#0d7377';

const TABS = ['Refund', 'Receipt Preview', 'EOD Cash-Up', 'Open Tabs'];
const DASH = '------------------------------------------';
const DDASH = '==========================================';

function rateLabel(rateBps: number): string {
  if (rateBps === 2000) return 'Standard (20%)';
  if (rateBps === 500) return 'Reduced (5%)';
  return 'Zero (0%)';
}

interface ReceiptScreenProps {
  order: OrderState;
  totals: OrderTotals;
  staff: Staff;
  tableLabel?: string | undefined;
  onBack: () => void;
  onTab: (tab: string) => void;
  onDone: () => void;
}

export function ReceiptScreen({ order, totals, staff, tableLabel, onBack, onTab, onDone }: ReceiptScreenProps) {
  const lines = order.lines.filter((l) => !l.isVoided);
  const lineSubById = new Map(totals.lines.map((l) => [l.lineId, l.subtotalP]));
  const paid = order.payments;
  const method = paid.length === 0 ? null : paid.some((p) => p.method === 'card') ? 'VISA' : 'CASH';
  const tenderedP = paid.reduce((s, p) => s + (p.tenderedP ?? p.amountP), 0);
  const date = new Date(order.createdAt);

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: '#edf2f2' }}>
      {/* Header */}
      <header
        className="flex h-20 shrink-0 items-center justify-between border-b bg-white px-6"
        style={{ borderColor: BORDER }}
      >
        <div className="flex items-center gap-4">
          <span className="rounded-lg px-3 py-2 text-lg font-bold text-white" style={{ backgroundColor: TEAL }}>
            GUSTO
          </span>
          <p className="text-base font-semibold" style={{ color: INK }}>
            Till #1 • Main Bar
          </p>
          <span className="flex items-center gap-1.5 text-sm" style={{ color: MUTED }}>
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Online
          </span>
        </div>
        <div className="flex items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={t === 'Receipt Preview' ? undefined : () => onTab(t)}
              className="rounded-lg px-4 py-3 text-sm font-semibold"
              style={
                t === 'Receipt Preview'
                  ? { backgroundColor: '#e6f2f2', border: `1px solid ${TEAL}`, color: TEAL }
                  : { color: MUTED }
              }
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-base font-semibold" style={{ color: INK }}>
          Server: {staff.name}
        </p>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-12 overflow-auto p-6">
        {/* Thermal receipt */}
        <div
          className="flex w-[400px] flex-col gap-3 rounded-sm border bg-white p-6 font-mono text-black shadow-[0px_12px_12px_rgba(0,0,0,0.05)]"
          style={{ borderColor: '#e2e8f0' }}
        >
          <p className="text-center text-[22px] font-extrabold">GUSTO TRATTORIA</p>
          <div className="text-center text-[12px]" style={{ color: '#555' }}>
            <p>12 Wardour St, Soho, London W1D 6QB</p>
            <p>Tel: 020 7437 1234</p>
          </div>
          <Dash />
          <div className="w-full text-[12px]">
            <div className="flex justify-between">
              <span className="font-bold">Order: #UK-{String(order.dailyNumber).padStart(5, '0')}</span>
              <span>{tableLabel?.replace('Table ', 'Table: ').split(' · ')[0] ?? 'Takeaway'}</span>
            </div>
            <div className="flex justify-between" style={{ color: '#555' }}>
              <span>Date: {date.toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <span>Server: {staff.name.split(' ')[0]}</span>
            </div>
          </div>
          <Dash />
          <div className="flex w-full flex-col gap-2 text-[12px]">
            {lines.map((l) => (
              <div key={l.lineId}>
                <div className="flex justify-between font-bold">
                  <span>
                    {l.quantity}x {l.name}
                  </span>
                  <span>{formatPence(pence(lineSubById.get(l.lineId) ?? 0))}</span>
                </div>
                {l.modifiers.map((m) => (
                  <p key={m.modifierId} className="text-[11px]" style={{ color: '#555' }}>
                    - {m.name}
                    {m.priceDeltaP !== 0 ? ` (${formatPence(pence(m.priceDeltaP))})` : ''}
                  </p>
                ))}
              </div>
            ))}
          </div>
          <Dash />
          <div className="flex w-full flex-col gap-1 text-[12px]">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatPence(pence(totals.subtotalP))}</span>
            </div>
            {totals.vatBreakdown.map((b) => (
              <div key={b.rateBps} className="flex justify-between text-[11px]" style={{ color: '#555' }}>
                <span>
                  VAT {rateLabel(b.rateBps)} on {formatPence(pence(b.grossP))}
                </span>
                <span>{formatPence(pence(b.vatP))}</span>
              </div>
            ))}
            {totals.serviceChargeP > 0 && (
              <div className="flex justify-between">
                <span>Service / Gratuity</span>
                <span>{formatPence(pence(totals.serviceChargeP))}</span>
              </div>
            )}
            {totals.discountP > 0 && (
              <div className="flex justify-between">
                <span>Discount</span>
                <span>-{formatPence(pence(totals.discountP))}</span>
              </div>
            )}
          </div>
          <p className="text-center text-[11px]" style={{ color: '#555' }}>
            {DDASH}
          </p>
          <div className="flex w-full items-center justify-between font-extrabold">
            <span className="text-[16px]">TOTAL DUE</span>
            <span className="text-[20px]">{formatPence(pence(totals.totalP))}</span>
          </div>
          <Dash />
          <div className="flex w-full flex-col gap-1 text-[12px]">
            {method ? (
              <>
                <div className="flex justify-between">
                  <span>Payment Method: {method}</span>
                  <span>{formatPence(pence(totals.paidP))}</span>
                </div>
                <div className="flex justify-between">
                  <span>Amount Tendered</span>
                  <span>{formatPence(pence(tenderedP))}</span>
                </div>
                <div className="flex justify-between">
                  <span>Change</span>
                  <span>{formatPence(pence(totals.changeDueP))}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between" style={{ color: '#555' }}>
                <span>Payment</span>
                <span>NOT YET PAID</span>
              </div>
            )}
          </div>
          <Dash />
          <p className="text-center text-[11px] font-bold">Thank you for dining with us!</p>
          <p className="text-center text-[9px]" style={{ color: '#555' }}>
            Allergen disclaimer: Our dishes may contain nuts, gluten, or dairy. Please speak to
            your server regarding any food intolerances.
          </p>
        </div>

        {/* Delivery options */}
        <div className="flex w-[520px] flex-col gap-6">
          <p className="text-2xl font-extrabold" style={{ color: INK }}>
            Receipt Delivery Options
          </p>
          <button
            type="button"
            className="flex h-16 items-center justify-center gap-2 rounded-lg text-base font-bold text-white"
            style={{ backgroundColor: TEAL }}
          >
            <PrinterIcon className="h-5 w-5" />
            Print Receipt (Thermal)
          </button>

          <DeliveryRow label="Email Receipt Address" placeholder="customer@email.com" action="Email" />
          <DeliveryRow label="SMS Receipt Phone" placeholder="+44 7700 900077" action="SMS" />

          <div className="h-px w-full" style={{ backgroundColor: BORDER }} />

          <button
            type="button"
            onClick={onDone}
            className="flex h-16 items-center justify-center rounded-lg text-base font-bold text-white"
            style={{ backgroundColor: TEAL }}
          >
            Done / New Order
          </button>
        </div>
      </div>
    </div>
  );
}

function Dash() {
  return (
    <p className="w-full text-center text-[11px]" style={{ color: '#555' }}>
      {DASH}
    </p>
  );
}

function DeliveryRow({
  label,
  placeholder,
  action,
}: {
  label: string;
  placeholder: string;
  action: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold" style={{ color: MUTED }}>
        {label}
      </p>
      <div className="flex gap-3">
        <input
          placeholder={placeholder}
          className="h-16 flex-1 rounded-lg border bg-white px-4 text-base outline-none"
          style={{ borderColor: BORDER, color: INK }}
        />
        <button
          type="button"
          className="flex h-16 w-40 items-center justify-center rounded-lg text-base font-bold"
          style={{ backgroundColor: '#e6f2f2', color: TEAL }}
        >
          {action}
        </button>
      </div>
    </div>
  );
}
