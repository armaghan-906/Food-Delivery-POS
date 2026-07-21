import { useMemo, useState } from 'react';
import { formatPence, pence } from '@pos/types';
import type { OrderState, OrderTotals } from '@pos/core';
import type { OverridePermission } from '../../../shared/ipc-contract.js';
import type { Authorizer, DiscountScope } from '../useOrder';

/**
 * 01-TILL / 1.9 — Discount & Void Modal.
 *
 * Both actions are escalated: the manager PIN is checked in the main process
 * against any staff member who actually holds the permission
 * (order.discount / order.void_*), and the resulting event is attributed to that
 * manager. Discounts and voids then go through the real command layer.
 */

const INK = '#111827';
const MUTED = '#4b5563';
const BORDER = '#d1d5db';
const TEAL = '#0d7377';
const RED = '#ef4444';

type Tab = 'discount' | 'void';

interface Preset {
  label: string;
  pct: number;
}
const PRESETS: Preset[] = [
  { label: '10% Staff', pct: 10 },
  { label: '20% Loyalty Member', pct: 20 },
  { label: '50% Manager Special', pct: 50 },
];

const REASONS = [
  'Promo Campaign Q1',
  'Loyalty Reward',
  'Manager Comp',
  'Service Recovery',
  'Staff Meal',
];

interface DiscountVoidModalProps {
  order: OrderState;
  totals: OrderTotals;
  selectedLineId: string | null;
  onClose: () => void;
  applyDiscount: (amountP: number, description: string, scope: DiscountScope, auth?: Authorizer) => void;
  voidLine: (lineId: string, reason: string, auth?: Authorizer) => void;
}

export function DiscountVoidModal({
  order,
  totals,
  selectedLineId,
  onClose,
  applyDiscount,
  voidLine,
}: DiscountVoidModalProps) {
  const [tab, setTab] = useState<Tab>('discount');

  const lines = useMemo(() => {
    const subById = new Map(totals.lines.map((l) => [l.lineId, l.subtotalP]));
    return order.lines
      .filter((l) => !l.isVoided)
      .map((l) => ({
        lineId: l.lineId,
        name: l.name,
        quantity: l.quantity,
        subtotalP: subById.get(l.lineId) ?? 0,
      }));
  }, [order, totals]);

  // Discount state
  const [presetIdx, setPresetIdx] = useState(1);
  const [customPct, setCustomPct] = useState('');
  const [customGbp, setCustomGbp] = useState('');
  const [scope, setScope] = useState<'order' | 'line'>('order');
  const [reason, setReason] = useState(REASONS[0]!);

  // Void state
  const [voidLineId, setVoidLineId] = useState<string | null>(selectedLineId);
  const [voidReason, setVoidReason] = useState('Wrong item ordered');

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const scopeBaseP =
    scope === 'line'
      ? (lines.find((l) => l.lineId === (selectedLineId ?? ''))?.subtotalP ?? totals.totalP)
      : totals.totalP;

  const discountP = useMemo(() => {
    if (customGbp) return Math.round(parseFloat(customGbp) * 100) || 0;
    if (customPct) return Math.round((scopeBaseP * (parseFloat(customPct) || 0)) / 100);
    return Math.round((scopeBaseP * PRESETS[presetIdx]!.pct) / 100);
  }, [customGbp, customPct, presetIdx, scopeBaseP]);

  const pressPin = (d: string) => {
    setError(null);
    if (d === 'C') return setPin('');
    if (d === '⌫') return setPin((p) => p.slice(0, -1));
    setPin((p) => (p.length < 8 ? p + d : p));
  };

  const apply = async () => {
    if (busy) return;
    if (pin.length < 4) {
      setError('Enter a manager PIN');
      return;
    }
    const permission: OverridePermission =
      tab === 'discount'
        ? 'order.discount'
        : order.payments.length > 0
          ? 'order.void_item_after_payment'
          : 'order.void_item_before_payment';

    setBusy(true);
    try {
      const result = window.pos
        ? await window.pos.authorizeOverride(permission, pin)
        : { ok: false as const };
      if (!result.ok) {
        setPin('');
        setError('PIN not authorised for this action');
        return;
      }
      const auth: Authorizer = { id: result.staff.id, role: result.staff.role };
      if (tab === 'discount') {
        const targetScope: DiscountScope =
          scope === 'line' && selectedLineId
            ? { kind: 'line', lineId: selectedLineId }
            : { kind: 'order' };
        applyDiscount(discountP, reason, targetScope, auth);
      } else {
        if (!voidLineId) {
          setError('Select an item to void');
          setBusy(false);
          return;
        }
        voidLine(voidLineId, voidReason, auth);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const applyLabel =
    tab === 'discount'
      ? `Apply Discount (${formatPence(pence(discountP))})`
      : 'Void Selected Item';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-[750px] flex-col rounded-2xl bg-white shadow-[0px_12px_16px_rgba(0,0,0,0.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tabs */}
        <div className="flex h-[72px] shrink-0">
          <TabBtn active={tab === 'discount'} onClick={() => setTab('discount')} color={TEAL}>
            APPLY DISCOUNT
          </TabBtn>
          <TabBtn active={tab === 'void'} onClick={() => setTab('void')} color={RED}>
            VOID ITEMS (Manager Key)
          </TabBtn>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 gap-6 overflow-auto p-6">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {tab === 'discount' ? (
              <>
                <Field label="Discount Presets">
                  <div className="flex flex-col gap-2">
                    {PRESETS.map((p, i) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => {
                          setPresetIdx(i);
                          setCustomPct('');
                          setCustomGbp('');
                        }}
                        className="flex h-[52px] items-center justify-center rounded-[10px] px-4 text-base font-bold"
                        style={
                          !customPct && !customGbp && presetIdx === i
                            ? { backgroundColor: TEAL, color: 'white' }
                            : { backgroundColor: 'white', border: `1.5px solid ${BORDER}`, color: INK }
                        }
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Custom Input">
                  <div className="flex gap-3">
                    <CustomInput label="Custom %" value={customPct} onChange={(v) => { setCustomPct(v); setCustomGbp(''); }} />
                    <CustomInput label="Custom £" value={customGbp} onChange={(v) => { setCustomGbp(v); setCustomPct(''); }} />
                  </div>
                </Field>

                <Field label="Applicable Scope">
                  <div className="flex w-fit gap-2 rounded-[10px] p-1" style={{ backgroundColor: '#f3f4f6' }}>
                    {(['order', 'line'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setScope(s)}
                        className="flex h-11 items-center justify-center rounded-[10px] px-4 text-base font-bold"
                        style={
                          scope === s
                            ? { backgroundColor: TEAL, color: 'white' }
                            : { backgroundColor: 'white', border: `1.5px solid ${BORDER}`, color: INK }
                        }
                      >
                        {s === 'order' ? 'Whole Order' : 'Selected Item'}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Reason Code">
                  <div
                    className="flex h-[52px] items-center justify-between rounded-lg border px-4"
                    style={{ borderColor: BORDER }}
                  >
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full bg-transparent text-[15px] font-semibold outline-none"
                      style={{ color: INK }}
                    >
                      {REASONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                </Field>
              </>
            ) : (
              <Field label="Select Item to Void">
                <div className="flex flex-col gap-2">
                  {lines.length === 0 && (
                    <p className="text-sm" style={{ color: MUTED }}>
                      No items to void.
                    </p>
                  )}
                  {lines.map((l) => (
                    <button
                      key={l.lineId}
                      type="button"
                      onClick={() => setVoidLineId(l.lineId)}
                      className="flex h-[52px] items-center justify-between rounded-[10px] px-4 text-base"
                      style={
                        voidLineId === l.lineId
                          ? { backgroundColor: '#fef2f2', border: `1.5px solid ${RED}`, color: INK }
                          : { backgroundColor: 'white', border: `1.5px solid ${BORDER}`, color: INK }
                      }
                    >
                      <span className="font-semibold">
                        {l.quantity}x {l.name}
                      </span>
                      <span className="font-bold">{formatPence(pence(l.subtotalP))}</span>
                    </button>
                  ))}
                  <div className="mt-2">
                    <p className="mb-1 text-[13px] font-extrabold uppercase" style={{ color: MUTED }}>
                      Void Reason
                    </p>
                    <input
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      className="h-[52px] w-full rounded-lg border px-4 text-[15px] outline-none"
                      style={{ borderColor: BORDER, color: INK }}
                    />
                  </div>
                </div>
              </Field>
            )}
          </div>

          {/* Auth panel */}
          <div className="flex w-[300px] shrink-0 flex-col gap-4 rounded-xl p-4" style={{ backgroundColor: '#f3f4f6' }}>
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs font-extrabold uppercase" style={{ color: error ? RED : '#b45309' }}>
                {error ?? 'Requires Manager PIN'}
              </p>
              <div className="flex h-10 items-center gap-3">
                {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                  <span
                    key={i}
                    className="h-3.5 w-3.5 rounded-full"
                    style={{
                      backgroundColor: i < pin.length ? TEAL : 'transparent',
                      border: `2px solid ${i < pin.length ? TEAL : BORDER}`,
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => pressPin(k)}
                  className="flex h-[60px] items-center justify-center rounded-[10px] text-base font-bold"
                  style={{
                    backgroundColor: 'white',
                    border: `1.5px solid ${k === 'C' || k === '⌫' ? TEAL : BORDER}`,
                    color: k === 'C' || k === '⌫' ? TEAL : INK,
                  }}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 gap-4 border-t p-6" style={{ borderColor: '#e5e7eb' }}>
          <button
            type="button"
            onClick={onClose}
            className="flex h-16 w-[220px] items-center justify-center rounded-[10px] border text-base font-bold"
            style={{ borderColor: TEAL, color: TEAL }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={busy}
            className="flex h-16 flex-1 items-center justify-center rounded-[10px] text-base font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: tab === 'void' ? RED : TEAL }}
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center justify-center text-lg font-extrabold"
      style={{
        color: active ? color : '#6b7280',
        backgroundColor: active ? 'white' : '#e5e7eb',
        borderBottom: active ? `4px solid ${color}` : '1px solid #d1d5db',
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[13px] font-extrabold uppercase" style={{ color: MUTED }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function CustomInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      className="flex h-[52px] flex-1 items-center justify-between rounded-lg border px-4"
      style={{ borderColor: BORDER }}
    >
      <span className="text-[15px]" style={{ color: MUTED }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))}
        placeholder="--"
        inputMode="decimal"
        className="w-16 bg-transparent text-right text-base font-bold outline-none"
        style={{ color: INK }}
      />
    </div>
  );
}
