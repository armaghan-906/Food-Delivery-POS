import { useEffect, useMemo, useState } from 'react';
import { formatPence, pence } from '@pos/types';
import type { OrderState, OrderTotals } from '@pos/core';
import type { ShiftInfo } from '../../../shared/ipc-contract.js';
import type { Staff } from '../useOrder';
import { PrinterIcon } from '../icons';

/**
 * 01-TILL / 1.12 — End-of-Day Cash-Up (Z-Report).
 *
 * The denomination counter is fully real — quantities × face value give the
 * counted drawer total. The shift (opening float, counted, expected, variance)
 * persists to the real `shifts` table via IPC. The Z-report aggregates are
 * derived from the current session order (full cross-order reporting waits on
 * order persistence / the sync layer).
 */

const INK = '#1e2525';
const MUTED = '#515e5e';
const BORDER = '#d2dbdb';
const TEAL = '#0d7377';

const TABS = ['Refund', 'Receipt Preview', 'EOD Cash-Up', 'Open Tabs'];

const DENOMS: { label: string; valueP: number }[] = [
  { label: '£50 Notes', valueP: 5000 },
  { label: '£20 Notes', valueP: 2000 },
  { label: '£10 Notes', valueP: 1000 },
  { label: '£5 Notes', valueP: 500 },
  { label: '£2 Coins', valueP: 200 },
  { label: '£1 Coins', valueP: 100 },
  { label: '50p Coins', valueP: 50 },
  { label: '20p Coins', valueP: 20 },
  { label: '10p Coins', valueP: 10 },
  { label: '5p Coins', valueP: 5 },
];

const OPENING_FLOAT_P = 15000; // £150 demo float

interface EODScreenProps {
  order: OrderState;
  totals: OrderTotals;
  staff: Staff;
  onBack: () => void;
  onTab: (tab: string) => void;
}

export function EODScreen({ order, totals, staff, onBack, onTab }: EODScreenProps) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [shift, setShift] = useState<ShiftInfo | null>(null);

  useEffect(() => {
    window.pos?.getOrOpenShift(OPENING_FLOAT_P).then(setShift).catch(() => setShift(null));
  }, []);

  const bump = (valueP: number, delta: number) =>
    setCounts((prev) => ({ ...prev, [valueP]: Math.max(0, (prev[valueP] ?? 0) + delta) }));

  const totalCountedP = DENOMS.reduce((s, d) => s + (counts[d.valueP] ?? 0) * d.valueP, 0);

  // Z-report derivations from the session order.
  const z = useMemo(() => {
    const cashP = order.payments.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amountP, 0);
    const cardP = order.payments.filter((p) => p.method === 'card').reduce((s, p) => s + p.amountP, 0);
    const openingFloatP = shift?.openingFloatP ?? OPENING_FLOAT_P;
    const expectedP = openingFloatP + cashP;
    const channels = {
      dine_in: order.channel === 'dine_in' ? { total: totals.totalP, orders: 1 } : { total: 0, orders: 0 },
      takeaway: order.channel === 'takeaway' ? { total: totals.totalP, orders: 1 } : { total: 0, orders: 0 },
      delivery: order.channel === 'delivery' ? { total: totals.totalP, orders: 1 } : { total: 0, orders: 0 },
    };
    return { cashP, cardP, expectedP, channels };
  }, [order, totals, shift]);

  const varianceP = totalCountedP - z.expectedP;

  const close = async () => {
    if (!shift || shift.status === 'closed') return;
    const updated = await window.pos?.closeShift(shift.id, totalCountedP, z.expectedP);
    if (updated) setShift(updated);
  };

  const closed = shift?.status === 'closed';

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: '#edf2f2' }}>
      <BackHeader active="EOD Cash-Up" staff={staff} onTab={onTab} />

      <div className="flex min-h-0 flex-1 gap-6 overflow-auto p-6">
        {/* Cash drawer count */}
        <div className="flex h-full flex-1 flex-col rounded-xl border bg-white p-6" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold" style={{ color: INK }}>
              Cash Drawer Count
            </h2>
            <span
              className="rounded-md px-3 py-1 text-xs font-bold"
              style={{ backgroundColor: '#e6f2f2', color: closed ? '#9b1c1c' : TEAL }}
            >
              DRAWER: {closed ? 'CLOSED' : 'OPEN'}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between px-1 text-xs font-semibold uppercase" style={{ color: MUTED }}>
            <span className="w-32">Denomination</span>
            <span>Quantity Counter</span>
            <span>Subtotal</span>
          </div>
          <div className="mt-2 flex flex-1 flex-col gap-2 overflow-y-auto">
            {DENOMS.map((d) => {
              const qty = counts[d.valueP] ?? 0;
              return (
                <div key={d.valueP} className="flex items-center justify-between">
                  <span className="w-32 text-base font-semibold" style={{ color: INK }}>
                    {d.label}
                  </span>
                  <div className="flex items-center overflow-hidden rounded-lg border" style={{ borderColor: BORDER }}>
                    <button
                      type="button"
                      onClick={() => bump(d.valueP, -1)}
                      className="flex h-11 w-16 items-center justify-center text-xl font-bold"
                      style={{ backgroundColor: '#f3f7f7', color: TEAL }}
                    >
                      −
                    </button>
                    <span className="flex h-11 w-24 items-center justify-center text-base font-bold" style={{ color: INK }}>
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => bump(d.valueP, 1)}
                      className="flex h-11 w-16 items-center justify-center text-xl font-bold"
                      style={{ backgroundColor: '#f3f7f7', color: TEAL }}
                    >
                      +
                    </button>
                  </div>
                  <span className="w-24 text-right text-base font-semibold" style={{ color: INK }}>
                    {formatPence(pence(qty * d.valueP))}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between border-t pt-4" style={{ borderColor: BORDER }}>
            <span className="text-lg font-bold" style={{ color: INK }}>
              TOTAL COUNTED CASH
            </span>
            <span className="text-2xl font-extrabold" style={{ color: TEAL }}>
              {formatPence(pence(totalCountedP))}
            </span>
          </div>
        </div>

        {/* Z-report */}
        <div className="flex h-full w-[720px] shrink-0 flex-col gap-4 rounded-xl border bg-white p-6" style={{ borderColor: BORDER }}>
          <h2 className="text-xl font-bold" style={{ color: INK }}>
            Z-Report Summary
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Expected Drawer Cash" value={formatPence(pence(z.expectedP))} />
            <StatBox label="Counted Drawer Cash" value={formatPence(pence(totalCountedP))} />
            <StatBox
              label={`Variance (${varianceP > 0 ? 'Over' : varianceP < 0 ? 'Short' : 'Exact'})`}
              value={`${varianceP > 0 ? '+' : ''}${formatPence(pence(varianceP))}`}
              tone={varianceP === 0 ? 'neutral' : varianceP > 0 ? 'good' : 'bad'}
            />
          </div>

          <p className="text-sm font-bold" style={{ color: MUTED }}>
            Card Payments by Provider
          </p>
          <div className="grid grid-cols-3 gap-3">
            <StatBox label="Card Total" value={formatPence(pence(z.cardP))} small />
            <StatBox label="Mastercard" value={formatPence(pence(0))} small />
            <StatBox label="AMEX" value={formatPence(pence(0))} small />
          </div>

          <p className="text-sm font-bold" style={{ color: MUTED }}>
            Sales Channel Splits
          </p>
          <div className="flex flex-col gap-2 text-base">
            <ChannelRow label="Dine-In" total={z.channels.dine_in.total} orders={z.channels.dine_in.orders} />
            <ChannelRow label="Takeaway" total={z.channels.takeaway.total} orders={z.channels.takeaway.orders} />
            <ChannelRow label="Delivery" total={z.channels.delivery.total} orders={z.channels.delivery.orders} />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between text-base">
              <span style={{ color: MUTED }}>Total Refunds Issued</span>
              <span style={{ color: '#dc2626' }}>-{formatPence(pence(order.refundedP))}</span>
            </div>
            <div className="flex justify-between text-base">
              <span style={{ color: MUTED }}>Total Discounts Applied</span>
              <span style={{ color: '#d97706' }}>-{formatPence(pence(totals.discountP))}</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: BORDER }}>
            <span className="text-lg font-bold" style={{ color: INK }}>
              NET SYSTEM REVENUE
            </span>
            <span className="text-2xl font-extrabold" style={{ color: TEAL }}>
              {formatPence(pence(totals.netP))}
            </span>
          </div>

          <div className="mt-auto flex gap-4">
            <button
              type="button"
              className="flex h-14 w-52 items-center justify-center gap-2 rounded-lg border text-base font-bold"
              style={{ borderColor: BORDER, color: INK }}
            >
              <PrinterIcon className="h-5 w-5" />
              Print Z-Report
            </button>
            <button
              type="button"
              onClick={close}
              disabled={closed}
              className="flex h-14 flex-1 items-center justify-center rounded-lg text-base font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: TEAL }}
            >
              {closed ? 'Till Closed ✓' : 'Close Till / Submit Report'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackHeader({
  active,
  staff,
  onTab,
}: {
  active: string;
  staff: Staff;
  onTab: (tab: string) => void;
}) {
  return (
    <header className="flex h-20 shrink-0 items-center justify-between border-b bg-white px-6" style={{ borderColor: BORDER }}>
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
            onClick={t === active ? undefined : () => onTab(t)}
            className="rounded-lg px-4 py-3 text-sm font-semibold"
            style={t === active ? { backgroundColor: '#e6f2f2', border: `1px solid ${TEAL}`, color: TEAL } : { color: MUTED }}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="text-base font-semibold" style={{ color: INK }}>
        Server: {staff.name}
      </p>
    </header>
  );
}

function StatBox({
  label,
  value,
  tone = 'neutral',
  small,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'bad';
  small?: boolean;
}) {
  const bg = tone === 'good' ? '#e6f7ee' : tone === 'bad' ? '#fef2f2' : '#f3f7f7';
  const color = tone === 'good' ? '#059669' : tone === 'bad' ? '#dc2626' : INK;
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3" style={{ borderColor: BORDER, backgroundColor: bg }}>
      <span className="text-xs" style={{ color: MUTED }}>
        {label}
      </span>
      <span className={small ? 'text-base font-bold' : 'text-xl font-extrabold'} style={{ color }}>
        {value}
      </span>
    </div>
  );
}

function ChannelRow({ label, total, orders }: { label: string; total: number; orders: number }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: INK }}>{label}</span>
      <span style={{ color: INK }}>
        {formatPence(pence(total))}{' '}
        <span style={{ color: MUTED }}>({orders} order{orders === 1 ? '' : 's'})</span>
      </span>
    </div>
  );
}
