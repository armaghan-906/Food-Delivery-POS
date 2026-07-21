import { useMemo, useState } from 'react';
import { formatPence, pence } from '@pos/types';
import type { OrderTotals } from '@pos/core';
import type { Staff } from '../useOrder';
import { DrawerIcon } from '../icons';

/**
 * 01-TILL / 1.7 — Cash Payment.
 *
 * The amount due is the order's real outstanding balance (so it also works after
 * a partial split payment). The tendered amount is entered on the numpad or via
 * quick-cash buttons; change is derived. Confirming records a real cash payment
 * with the tendered value, and the engine derives the change.
 */

const INK = '#111827';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const TEAL = '#0d7377';

function ceilTo(amount: number, step: number): number {
  return Math.ceil(amount / step) * step;
}

interface CashPaymentProps {
  totals: OrderTotals;
  staff: Staff;
  tableLabel?: string | undefined;
  onCancel: () => void;
  onConfirm: (amountDueP: number, tenderedP: number) => void;
}

export function CashPayment({ totals, staff, onCancel, onConfirm }: CashPaymentProps) {
  const dueP = totals.outstandingP > 0 ? totals.outstandingP : totals.totalP;
  const [tenderedP, setTenderedP] = useState(0);

  const quicks = useMemo(() => {
    const set = new Set<number>([dueP, ceilTo(dueP + 1, 1000), ceilTo(dueP + 1, 2000)]);
    return [...set].slice(0, 3);
  }, [dueP]);

  const changeP = Math.max(0, tenderedP - dueP);
  const enough = tenderedP >= dueP;

  const press = (d: string) => {
    setTenderedP((t) => {
      if (d === 'C') return 0;
      if (d === '00') return Math.min(t * 100, 9_999_99);
      return Math.min(t * 10 + Number(d), 9_999_99);
    });
  };
  const backspace = () => setTenderedP((t) => Math.floor(t / 10));

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00', 'C'];

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: '#f3f4f6' }}>
      {/* Header */}
      <header
        className="flex shrink-0 items-center justify-between border-b bg-white px-8 py-4"
        style={{ borderColor: BORDER }}
      >
        <div className="flex items-center gap-3">
          <span
            className="rounded-md px-2 py-1 text-xs font-bold text-white"
            style={{ backgroundColor: TEAL }}
          >
            TILL 04
          </span>
          <p className="text-lg font-bold" style={{ color: INK }}>
            Cash Checkout Process
          </p>
        </div>
        <p className="text-sm" style={{ color: MUTED }}>
          Staff: <span className="font-semibold" style={{ color: INK }}>{staff.name}</span>
        </p>
      </header>

      <div className="flex min-h-0 flex-1 gap-8 p-8">
        {/* Left: summary + calc */}
        <div
          className="flex h-full flex-1 flex-col gap-6 rounded-2xl border bg-white p-8"
          style={{ borderColor: BORDER }}
        >
          <div className="flex flex-col gap-2">
            <p className="text-base font-semibold uppercase" style={{ color: MUTED }}>
              Total Amount Due
            </p>
            <p className="text-[72px] font-extrabold leading-none" style={{ color: INK }}>
              {formatPence(pence(dueP))}
            </p>
          </div>

          <div className="h-px w-full" style={{ backgroundColor: BORDER }} />

          <div className="flex flex-col gap-3">
            <p className="text-sm font-semibold uppercase" style={{ color: MUTED }}>
              Quick Cash Select
            </p>
            <div className="flex gap-4">
              {quicks.map((q, i) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setTenderedP(q)}
                  className="flex flex-1 flex-col items-center justify-center rounded-xl py-4"
                  style={{ border: `2px solid ${TEAL}`, backgroundColor: 'white' }}
                >
                  <span className="text-sm font-semibold uppercase" style={{ color: TEAL }}>
                    {i === 0 ? 'Exact Tender' : 'Round Up'}
                  </span>
                  <span className="text-[22px] font-bold" style={{ color: INK }}>
                    {formatPence(pence(q))}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="h-px w-full" style={{ backgroundColor: BORDER }} />

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-lg font-medium" style={{ color: MUTED }}>
                Amount Tendered
              </p>
              <div
                className="rounded-lg border px-4 py-2"
                style={{ backgroundColor: '#f3f4f6', borderColor: BORDER }}
              >
                <span className="text-[32px] font-bold" style={{ color: INK }}>
                  {formatPence(pence(tenderedP))}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between py-3">
              <p className="text-xl font-semibold" style={{ color: TEAL }}>
                Change Due
              </p>
              <div
                className="rounded-lg border-[1.5px] px-5 py-3"
                style={{ backgroundColor: '#def7ec', borderColor: '#10b981' }}
              >
                <span className="text-[40px] font-extrabold" style={{ color: '#03543f' }}>
                  {formatPence(pence(changeP))}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-auto flex gap-4">
            <button
              type="button"
              onClick={onCancel}
              className="flex flex-1 items-center justify-center rounded-xl border py-5 text-lg font-bold"
              style={{ backgroundColor: '#fde8e8', borderColor: '#ef4444', color: '#9b1c1c' }}
            >
              Cancel Transaction
            </button>
            <button
              type="button"
              onClick={() => onConfirm(dueP, tenderedP)}
              disabled={!enough}
              className="flex flex-1 items-center justify-center rounded-xl py-5 text-lg font-bold text-white shadow-[0px_8px_8px_rgba(16,185,129,0.3)] disabled:opacity-40 disabled:shadow-none"
              style={{ backgroundColor: '#10b981' }}
            >
              Confirm Cash Paid
            </button>
          </div>
        </div>

        {/* Right: numpad */}
        <div
          className="flex w-[560px] shrink-0 flex-col gap-6 rounded-2xl border bg-white p-8"
          style={{ borderColor: BORDER }}
        >
          <div className="flex items-center justify-between text-sm font-semibold">
            <span className="uppercase" style={{ color: MUTED }}>
              Manual Cash Input
            </span>
            <button type="button" onClick={backspace} style={{ color: TEAL }}>
              Backspace
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {keys.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                className="flex h-20 items-center justify-center rounded-xl border text-[28px] font-semibold"
                style={
                  k === 'C'
                    ? { backgroundColor: '#eaf3f4', borderColor: BORDER, color: TEAL }
                    : { backgroundColor: 'white', borderColor: BORDER, color: INK }
                }
              >
                {k}
              </button>
            ))}
          </div>
          <div
            className="flex items-center gap-3 rounded-[10px] p-4"
            style={{ backgroundColor: '#f3f4f6' }}
          >
            <span style={{ color: MUTED }}>
              <DrawerIcon className="h-5 w-5" />
            </span>
            <p className="text-[13px]" style={{ color: MUTED }}>
              Confirming payment will automatically command the cash drawer to pop open.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
