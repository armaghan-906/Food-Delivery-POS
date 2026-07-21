import { useMemo, useState } from 'react';
import { formatPence, pence } from '@pos/types';
import type { OrderState, OrderTotals } from '@pos/core';
import { ArrowLeftIcon, MoveIcon } from '../icons';

/**
 * 01-TILL / 1.5 — Split Bill.
 *
 * Operates on the live order's lines. "Split by Item" assigns each line to a
 * guest (unassigned lines sit in the pool); "Split Evenly" divides the total by
 * head count. "Pay Guest N" records a real partial cash payment through the
 * order engine, so the guests' payments sum back to the order total.
 */

const INK = '#111827';
const MUTED = '#4b5563';
const BORDER = '#d1d5db';
const TEAL = '#0d7377';
const TINT = '#e6f4f4';

type Mode = 'even' | 'item';

interface LineInfo {
  lineId: string;
  name: string;
  quantity: number;
  subtotalP: number;
}

interface SplitBillProps {
  order: OrderState;
  totals: OrderTotals;
  tableLabel?: string | undefined;
  onBack: () => void;
  payCash: (amountP: number) => void;
}

/** Even shares that always sum to the total — the last guest absorbs the remainder. */
function evenShares(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const shares = Array<number>(n).fill(base);
  if (n > 0) shares[n - 1]! += total - base * n;
  return shares;
}

export function SplitBill({ order, totals, tableLabel, onBack, payCash }: SplitBillProps) {
  const lines = useMemo<LineInfo[]>(() => {
    const byId = new Map(totals.lines.map((l) => [l.lineId, l.subtotalP]));
    return order.lines
      .filter((l) => !l.isVoided)
      .map((l) => ({
        lineId: l.lineId,
        name: l.name,
        quantity: l.quantity,
        subtotalP: byId.get(l.lineId) ?? 0,
      }));
  }, [order, totals]);

  const [mode, setMode] = useState<Mode>('item');
  const [guestCount, setGuestCount] = useState(2);
  const [activeGuest, setActiveGuest] = useState(0);
  // lineId -> guest index, or absent = unassigned pool.
  const [assignment, setAssignment] = useState<Record<string, number>>({});
  const [paid, setPaid] = useState<Set<number>>(new Set());

  const setGuests = (n: number) => {
    setGuestCount(n);
    if (activeGuest >= n) setActiveGuest(n - 1);
    // Any line assigned to a now-removed guest returns to the pool.
    setAssignment((prev) => {
      const next: Record<string, number> = {};
      for (const [lineId, g] of Object.entries(prev)) if (g < n) next[lineId] = g;
      return next;
    });
    setPaid(new Set());
  };

  const reset = () => {
    setAssignment({});
    setPaid(new Set());
  };

  const assignToActive = (lineId: string) =>
    setAssignment((prev) => ({ ...prev, [lineId]: activeGuest }));
  const returnToPool = (lineId: string) =>
    setAssignment((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });

  const pool = lines.filter((l) => assignment[l.lineId] === undefined);
  const evenAmounts = evenShares(totals.totalP, guestCount);

  const guestLines = (g: number) => lines.filter((l) => assignment[l.lineId] === g);
  const guestSubtotal = (g: number) =>
    mode === 'even' ? evenAmounts[g]! : guestLines(g).reduce((s, l) => s + l.subtotalP, 0);

  const payGuest = (g: number) => {
    const amount = guestSubtotal(g);
    if (amount <= 0 || paid.has(g)) return;
    payCash(amount);
    setPaid((prev) => new Set(prev).add(g));
  };

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: '#f3f4f6' }}>
      {/* Header */}
      <header
        className="flex h-20 shrink-0 items-center justify-between border-b bg-white px-6"
        style={{ borderColor: '#e5e7eb' }}
      >
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="flex h-12 w-12 items-center justify-center rounded-lg border bg-white"
            style={{ borderColor: '#e5e7eb', color: INK }}
            aria-label="Back"
          >
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <h1 className="text-2xl font-extrabold" style={{ color: INK }}>
            {tableLabel ?? 'Order'} • Split Bill Utility
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[13px] font-semibold" style={{ color: MUTED }}>
              Total Bill
            </p>
            <p className="text-[22px] font-extrabold" style={{ color: INK }}>
              {formatPence(pence(totals.totalP))}
            </p>
          </div>
          <button
            type="button"
            onClick={reset}
            className="flex h-12 w-[140px] items-center justify-center rounded-[10px] border bg-white text-base font-bold"
            style={{ borderColor: BORDER, color: INK }}
          >
            Reset Split
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6 overflow-auto p-6">
        {/* Method + guest count */}
        <div className="flex items-center gap-6">
          <div
            className="flex gap-2 rounded-xl border bg-white p-1.5"
            style={{ borderColor: '#e5e7eb' }}
          >
            {(['even', 'item'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="flex h-[52px] w-[200px] items-center justify-center rounded-[10px] text-base font-bold"
                style={
                  mode === m
                    ? { backgroundColor: TEAL, color: 'white' }
                    : { backgroundColor: 'white', border: `1.5px solid ${BORDER}`, color: INK }
                }
              >
                {m === 'even' ? 'Split Evenly' : 'Split by Item'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[15px] font-bold" style={{ color: MUTED }}>
              Guest Count:
            </p>
            <div className="flex gap-1">
              {[2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setGuests(n)}
                  className="flex h-[52px] w-14 items-center justify-center rounded-[10px] text-base font-bold"
                  style={
                    guestCount === n
                      ? { backgroundColor: TEAL, color: 'white' }
                      : { backgroundColor: 'white', border: `1.5px solid ${BORDER}`, color: INK }
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Unassigned pool (item mode only) */}
        {mode === 'item' && (
          <div className="flex flex-col gap-3 rounded-xl border bg-white p-5" style={{ borderColor: '#e5e7eb' }}>
            <p className="text-sm font-extrabold uppercase" style={{ color: MUTED }}>
              Unassigned Items Pool — assigning to Guest {activeGuest + 1} (tap to assign)
            </p>
            {pool.length === 0 ? (
              <p className="text-sm" style={{ color: MUTED }}>
                All items assigned.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {pool.map((l) => (
                  <button
                    key={l.lineId}
                    type="button"
                    onClick={() => assignToActive(l.lineId)}
                    className="flex items-center gap-5 rounded-[10px] p-4"
                    style={{ backgroundColor: TINT, border: `1.5px solid ${TEAL}` }}
                  >
                    <span className="text-base font-bold" style={{ color: TEAL }}>
                      {l.quantity}x {l.name}
                    </span>
                    <span className="text-base font-extrabold" style={{ color: TEAL }}>
                      {formatPence(pence(l.subtotalP))}
                    </span>
                    <MoveIcon className="h-5 w-5" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Guest bills */}
        <div className="flex flex-1 flex-wrap gap-6">
          {Array.from({ length: guestCount }).map((_, g) => {
            const isActive = mode === 'item' && g === activeGuest;
            const subtotal = guestSubtotal(g);
            const isPaid = paid.has(g);
            return (
              <div
                key={g}
                onClick={() => setActiveGuest(g)}
                className="flex min-w-[280px] flex-1 flex-col justify-between rounded-2xl bg-white p-6"
                style={{ border: `${isActive ? 2 : 1}px solid ${isActive ? TEAL : '#e5e7eb'}` }}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xl font-extrabold" style={{ color: INK }}>
                      GUEST {g + 1} BILL
                    </p>
                    {mode === 'item' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveGuest(g);
                        }}
                        className="flex h-10 items-center justify-center rounded-[10px] border px-4 text-base font-bold"
                        style={{ borderColor: BORDER, color: INK }}
                      >
                        Assign To
                      </button>
                    )}
                  </div>
                  <div className="h-px w-full" style={{ backgroundColor: '#e5e7eb' }} />
                  <div className="flex flex-col gap-3.5">
                    {mode === 'even' ? (
                      <div className="flex items-center justify-between text-base" style={{ color: INK }}>
                        <span className="font-semibold">Even share (1/{guestCount})</span>
                        <span className="font-bold">{formatPence(pence(subtotal))}</span>
                      </div>
                    ) : guestLines(g).length === 0 ? (
                      <p className="text-sm" style={{ color: MUTED }}>
                        No items assigned yet.
                      </p>
                    ) : (
                      guestLines(g).map((l) => (
                        <button
                          key={l.lineId}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            returnToPool(l.lineId);
                          }}
                          className="flex items-center justify-between text-left text-base"
                          style={{ color: INK }}
                        >
                          <span className="font-semibold">
                            {l.quantity}x {l.name}
                          </span>
                          <span className="font-bold">{formatPence(pence(l.subtotalP))}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="h-px w-full" style={{ backgroundColor: '#e5e7eb' }} />
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold" style={{ color: MUTED }}>
                      Subtotal
                    </span>
                    <span className="text-2xl font-extrabold" style={{ color: INK }}>
                      {formatPence(pence(subtotal))}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      payGuest(g);
                    }}
                    disabled={isPaid || subtotal <= 0}
                    className="flex h-16 w-full items-center justify-center rounded-[10px] text-base font-bold text-white disabled:opacity-50"
                    style={{ backgroundColor: isPaid ? '#16a34a' : TEAL }}
                  >
                    {isPaid
                      ? `Guest ${g + 1} Paid ✓`
                      : `Pay Guest ${g + 1} (${formatPence(pence(subtotal))})`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
