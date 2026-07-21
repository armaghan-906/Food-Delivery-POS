import { useMemo } from 'react';
import { formatPence } from '@pos/types';
import type { OrderState } from '@pos/core';
import type { OrderTotals } from '@pos/core';
import type { Staff } from '../useOrder';
import { CardIcon, MinusIcon, PlusIcon } from '../icons';

interface ActiveTicketProps {
  order: OrderState;
  totals: OrderTotals;
  staff: Staff;
  selectedLineId: string | null;
  onSelectLine: (lineId: string | null) => void;
  onInc: (lineId: string) => void;
  onDec: (lineId: string) => void;
  onVoid: (lineId: string) => void;
  onPay: () => void;
  onSplit: () => void;
  onDiscount: () => void;
  onHold: () => void;
}

function staffInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ActiveTicket({
  order,
  totals,
  staff,
  selectedLineId,
  onSelectLine,
  onInc,
  onDec,
  onVoid,
  onPay,
  onSplit,
  onDiscount,
  onHold,
}: ActiveTicketProps) {
  const lineTotals = useMemo(
    () => new Map(totals.lines.map((l) => [l.lineId, l])),
    [totals],
  );
  const activeLines = order.lines.filter((l) => !l.isVoided);
  const selectedActive =
    selectedLineId != null && activeLines.some((l) => l.lineId === selectedLineId);

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-line bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Active Ticket</h2>
          <p className="text-xs text-subtle">
            Order Ref: #UK-{String(order.dailyNumber).padStart(5, '0')}
          </p>
        </div>
        <span className="rounded-md bg-canvas px-2.5 py-1 text-xs font-semibold text-subtle">
          Staff: {staffInitials(staff.name)}
        </span>
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {activeLines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-medium text-subtle">No items yet</p>
            <p className="mt-1 text-xs text-faint">Tap the menu to start this order.</p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {order.lines.map((line) => {
              if (line.isVoided) {
                return (
                  <li
                    key={line.lineId}
                    className="flex items-center justify-between px-2 py-2 text-sm text-faint line-through"
                  >
                    <span>
                      {line.quantity} × {line.name}
                    </span>
                    <span className="text-[11px] no-underline">voided</span>
                  </li>
                );
              }
              const lt = lineTotals.get(line.lineId);
              const selected = line.lineId === selectedLineId;
              return (
                <li key={line.lineId}>
                  <button
                    type="button"
                    onClick={() => onSelectLine(selected ? null : line.lineId)}
                    className={`flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors ${
                      selected ? 'bg-brand-50' : 'hover:bg-canvas'
                    }`}
                  >
                    {/* Qty stepper */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Stepper
                        label="Decrease"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDec(line.lineId);
                        }}
                      >
                        <MinusIcon className="h-3.5 w-3.5" />
                      </Stepper>
                      <span className="w-5 text-center text-sm font-bold tabular-nums text-ink">
                        {line.quantity}
                      </span>
                      <Stepper
                        label="Increase"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInc(line.lineId);
                        }}
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                      </Stepper>
                    </div>

                    {/* Name + modifiers */}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold leading-snug text-ink">
                        {line.name}
                      </div>
                      {line.modifiers.map((m) => (
                        <div key={m.modifierId} className="text-xs text-brand-600">
                          + {m.name}
                          {m.priceDeltaP !== 0 && ` (${formatPence(m.priceDeltaP)})`}
                        </div>
                      ))}
                    </div>

                    {/* Line total */}
                    <span className="shrink-0 pt-0.5 text-sm font-bold tabular-nums text-ink">
                      {lt ? formatPence(lt.subtotalP) : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Totals */}
      <div className="border-t border-line px-5 py-4">
        <Row label="Subtotal" value={formatPence(totals.subtotalP)} />
        {totals.discountP > 0 && (
          <Row label="Discount" value={`-${formatPence(totals.discountP)}`} accent />
        )}
        <Row label="VAT (inclusive)" value={formatPence(totals.vatP)} muted />
        <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-base font-bold text-ink">TOTAL DUE</span>
          <span className="text-2xl font-bold text-brand-500 tabular-nums">
            {formatPence(totals.totalP)}
          </span>
        </div>

        {/* Secondary actions */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <SecondaryButton
            disabled={activeLines.length === 0}
            onClick={onHold}
            title="Park this order to Open Tabs"
          >
            Hold
          </SecondaryButton>
          <SecondaryButton
            disabled={activeLines.length === 0}
            onClick={onDiscount}
            title="Apply a discount (manager PIN)"
          >
            Discount
          </SecondaryButton>
          <SecondaryButton
            variant="danger"
            disabled={!selectedActive}
            onClick={() => selectedLineId && onVoid(selectedLineId)}
            title={selectedActive ? 'Void selected line' : 'Select a line to void'}
          >
            Void
          </SecondaryButton>
        </div>

        {/* Split + Pay */}
        <button
          type="button"
          onClick={onSplit}
          disabled={activeLines.length === 0}
          className="mt-3 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-line bg-white text-sm font-semibold text-ink transition-colors hover:enabled:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
        >
          Split bill
        </button>
        <button
          type="button"
          onClick={onPay}
          disabled={activeLines.length === 0}
          className="mt-2 flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-brand-500 text-lg font-bold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-faint"
        >
          <CardIcon className="h-5 w-5" />
          PAY {formatPence(totals.totalP)}
        </button>
      </div>
    </aside>
  );
}

function Stepper({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  label: string;
}) {
  return (
    <span
      role="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-line bg-white text-subtle hover:border-brand-500 hover:text-brand-500"
    >
      {children}
    </span>
  );
}

function Row({
  label,
  value,
  muted,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className={muted ? 'text-subtle' : 'text-ink'}>{label}</span>
      <span
        className={`font-semibold tabular-nums ${
          accent ? 'text-brand-600' : muted ? 'text-subtle' : 'text-ink'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
  title,
  variant,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  variant?: 'danger';
}) {
  const danger = variant === 'danger';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`min-h-[48px] rounded-xl border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? 'border-[#fecaca] bg-[#fef2f2] text-[#dc2626] hover:enabled:bg-[#fee2e2]'
          : 'border-line bg-white text-ink hover:enabled:bg-canvas'
      }`}
    >
      {children}
    </button>
  );
}
