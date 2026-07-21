import { useMemo, useState } from 'react';
import { formatPence, pence } from '@pos/types';
import type { OrderState, OrderTotals } from '@pos/core';
import type { OverridePermission } from '../../../shared/ipc-contract.js';
import type { Authorizer, Staff } from '../useOrder';
import { LockIcon, SearchIcon } from '../icons';

/**
 * 01-TILL / 1.10 — Refund.
 *
 * Refunds selected items from the order back through the real command layer
 * (issueRefund), gated by a manager PIN (payment.refund). VAT reclaim is derived
 * per line from its frozen rate. Order-history search is a placeholder for now —
 * the till operates on the current order until order persistence lands.
 */

const INK = '#1e2525';
const MUTED = '#515e5e';
const FAINT = '#879999';
const BORDER = '#d2dbdb';
const TEAL = '#0d7377';
const AMBER = '#d97706';

const TABS = ['Refund', 'Receipt Preview', 'EOD Cash-Up', 'Open Tabs'];

function extractVat(grossP: number, rateBps: number): number {
  if (rateBps === 0) return 0;
  const net = Math.round((grossP * 10000) / (10000 + rateBps));
  return grossP - net;
}

interface RefundScreenProps {
  order: OrderState;
  totals: OrderTotals;
  staff: Staff;
  tableLabel?: string | undefined;
  onBack: () => void;
  onTab: (tab: string) => void;
  issueRefund: (amountP: number, reason: string, auth?: Authorizer) => void;
}

export function RefundScreen({
  order,
  totals,
  staff,
  tableLabel,
  onBack,
  onTab,
  issueRefund,
}: RefundScreenProps) {
  const lines = useMemo(() => {
    const byId = new Map(totals.lines.map((l) => [l.lineId, l]));
    return order.lines
      .filter((l) => !l.isVoided)
      .map((l) => {
        const t = byId.get(l.lineId);
        return {
          lineId: l.lineId,
          name: l.name,
          quantity: l.quantity,
          modifiers: l.modifiers.map((m) => m.name).join(', '),
          subtotalP: t?.subtotalP ?? 0,
          rateBps: t?.rateBps ?? 2000,
        };
      });
  }, [order, totals]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState<'card' | 'cash'>('card');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const selectAll = () => setSelected(new Set(lines.map((l) => l.lineId)));

  const chosen = lines.filter((l) => selected.has(l.lineId));
  const refundSubtotalP = chosen.reduce((s, l) => s + l.subtotalP, 0);
  const vatReclaimP = chosen.reduce((s, l) => s + extractVat(l.subtotalP, l.rateBps), 0);

  const paymentBadge =
    order.payments.length === 0
      ? 'UNPAID'
      : order.payments.some((p) => p.method === 'card')
        ? 'CARD / VISA'
        : 'CASH';

  const pressPin = (d: string) => {
    setError(null);
    if (d === 'C') return setPin('');
    setPin((p) => (p.length < 8 ? p + d : p));
  };

  const process = async () => {
    if (busy) return;
    if (chosen.length === 0) return setError('Select items to refund');
    if (pin.length < 4) return setError('Enter a manager PIN');
    setBusy(true);
    try {
      const permission: OverridePermission = 'payment.refund';
      const result = window.pos
        ? await window.pos.authorizeOverride(permission, pin)
        : { ok: false as const };
      if (!result.ok) {
        setPin('');
        setError('PIN not authorised for refunds');
        return;
      }
      issueRefund(refundSubtotalP, `Refund to ${destination} — ${chosen.length} item(s)`, {
        id: result.staff.id,
        role: result.staff.role,
      });
      onBack();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: '#edf2f2' }}>
      {/* Header */}
      <header
        className="flex h-20 shrink-0 items-center justify-between border-b bg-white px-6"
        style={{ borderColor: BORDER }}
      >
        <div className="flex items-center gap-4">
          <span
            className="rounded-lg px-3 py-2 text-lg font-bold text-white"
            style={{ backgroundColor: TEAL }}
          >
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
              onClick={t === 'Refund' ? undefined : () => onTab(t)}
              className="rounded-lg px-4 py-3 text-sm font-semibold"
              style={
                t === 'Refund'
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

      <div className="flex min-h-0 flex-1 gap-6 p-6">
        {/* Left: order + items */}
        <div className="flex h-full flex-1 flex-col gap-5">
          <div
            className="flex h-16 shrink-0 items-center gap-3 rounded-lg border bg-white px-4"
            style={{ borderColor: BORDER }}
          >
            <span style={{ color: FAINT }}>
              <SearchIcon className="h-6 w-6" />
            </span>
            <span className="flex-1 text-base" style={{ color: FAINT }}>
              Search past orders by #No, date, or customer name…
            </span>
            <span
              className="flex h-11 items-center rounded-md px-4 text-sm font-semibold"
              style={{ backgroundColor: '#e6f2f2', color: TEAL }}
            >
              Find Order
            </span>
          </div>

          <div
            className="flex min-h-0 flex-1 flex-col gap-4 rounded-xl border bg-white p-6"
            style={{ borderColor: BORDER }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold" style={{ color: INK }}>
                  Order #UK-{String(order.dailyNumber).padStart(5, '0')}
                </p>
                <p className="text-sm" style={{ color: FAINT }}>
                  {tableLabel ?? 'Order'} • Server: {staff.name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: MUTED }}>
                  Original Payment:
                </span>
                <span
                  className="rounded-md px-3 py-1 text-xs font-bold"
                  style={{ backgroundColor: '#e6f2f2', color: TEAL }}
                >
                  {paymentBadge}
                </span>
              </div>
            </div>
            <div className="h-px w-full" style={{ backgroundColor: BORDER }} />
            <div className="flex items-center justify-between py-1">
              <p className="text-sm font-semibold" style={{ color: MUTED }}>
                Tap items to select for PARTIAL REFUND
              </p>
              <button
                type="button"
                onClick={selectAll}
                className="flex h-16 items-center justify-center rounded-lg border px-5 text-base font-bold"
                style={{ borderColor: BORDER, color: INK }}
              >
                Select All (Full Refund)
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
              {lines.map((l) => {
                const on = selected.has(l.lineId);
                return (
                  <button
                    key={l.lineId}
                    type="button"
                    onClick={() => toggle(l.lineId)}
                    className="flex items-center justify-between rounded-lg p-4 text-left"
                    style={
                      on
                        ? { backgroundColor: '#fef3c7', border: `1.5px solid #f59e0b` }
                        : { backgroundColor: 'white', border: `1px solid ${BORDER}` }
                    }
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full text-base font-bold"
                        style={
                          on
                            ? { backgroundColor: AMBER, color: 'white' }
                            : { backgroundColor: '#f3f7f7', border: `1px solid ${BORDER}`, color: MUTED }
                        }
                      >
                        {l.quantity}
                      </span>
                      <div>
                        <p className="text-base font-bold" style={{ color: INK }}>
                          {l.name}
                        </p>
                        <p className="text-sm" style={{ color: MUTED }}>
                          {l.modifiers || 'No modifiers'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <span className="text-base font-bold" style={{ color: INK }}>
                        {formatPence(pence(l.subtotalP))}
                      </span>
                      <span
                        className="rounded px-2.5 py-1 text-xs font-bold"
                        style={
                          on
                            ? { backgroundColor: AMBER, color: 'white' }
                            : { backgroundColor: '#f3f7f7', border: `1px solid ${BORDER}`, color: FAINT }
                        }
                      >
                        {on ? 'REFUND' : 'Keep'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: auth + totals */}
        <div className="flex h-full w-[420px] shrink-0 flex-col gap-5">
          <div className="flex flex-col gap-4 rounded-xl border bg-white p-5" style={{ borderColor: BORDER }}>
            <div className="flex items-center gap-2">
              <span style={{ color: INK }}>
                <LockIcon className="h-5 w-5" />
              </span>
              <p className="text-base font-bold" style={{ color: error ? '#ef4444' : INK }}>
                {error ?? 'Requires Manager Authorisation'}
              </p>
            </div>
            <div
              className="flex h-[52px] items-center justify-center gap-3 rounded-lg"
              style={{ backgroundColor: '#f3f7f7' }}
            >
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <span
                  key={i}
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: i < pin.length ? TEAL : '#c7d2d2' }}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'Enter'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => (k === 'Enter' ? process() : pressPin(k))}
                  className="flex h-16 items-center justify-center rounded-lg text-base font-bold"
                  style={{
                    backgroundColor: k === 'Enter' ? '#e6f2f2' : k === 'C' ? 'white' : '#f3f7f7',
                    border: k === 'C' ? `1px solid ${BORDER}` : 'none',
                    color: k === 'Enter' ? TEAL : INK,
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border bg-white p-6" style={{ borderColor: BORDER }}>
            <p className="text-base font-bold" style={{ color: INK }}>
              Refund Summary
            </p>
            <Row label="Selected Items Subtotal" value={formatPence(pence(refundSubtotalP))} bold />
            <Row label="VAT Reclaim" value={formatPence(pence(vatReclaimP))} />
            <div className="h-px w-full" style={{ backgroundColor: BORDER }} />
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold" style={{ color: INK }}>
                TOTAL REFUND
              </span>
              <span className="text-[28px] font-extrabold" style={{ color: AMBER }}>
                {formatPence(pence(refundSubtotalP))}
              </span>
            </div>
            <p className="text-sm font-bold" style={{ color: MUTED }}>
              Refund Destination Method
            </p>
            <div className="flex gap-3">
              {(['card', 'cash'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDestination(d)}
                  className="flex h-[60px] flex-1 items-center gap-2 rounded-lg px-3 text-sm font-bold"
                  style={
                    destination === d
                      ? { backgroundColor: '#e6f2f2', border: `2px solid ${TEAL}`, color: TEAL }
                      : { backgroundColor: 'white', border: `1px solid ${BORDER}`, color: MUTED }
                  }
                >
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{
                      border: `2px solid ${destination === d ? TEAL : BORDER}`,
                      backgroundColor: destination === d ? TEAL : 'transparent',
                    }}
                  />
                  {d === 'card' ? 'Original Card (Visa)' : 'Cash Drawer'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex h-16 w-[140px] items-center justify-center rounded-lg border text-base font-bold"
              style={{ borderColor: BORDER, color: INK }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={process}
              disabled={busy}
              className="flex h-16 flex-1 items-center justify-center rounded-lg text-base font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: AMBER }}
            >
              Process Refund ({formatPence(pence(refundSubtotalP))})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between text-base">
      <span style={{ color: '#515e5e' }}>{label}</span>
      <span style={{ color: '#1e2525', fontWeight: bold ? 600 : 400 }}>{value}</span>
    </div>
  );
}
