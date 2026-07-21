import { useEffect, useMemo, useState } from 'react';
import { formatPence, pence } from '@pos/types';
import type { OrderTotals } from '@pos/core';
import {
  CardIcon,
  CheckIcon,
  MailIcon,
  MessageCircleIcon,
  PrinterIcon,
  RefreshIcon,
  XCircleIcon,
} from '../icons';

/**
 * 01-TILL / 1.8 — Card Payment (Waiting + Result).
 *
 * A simulated card-terminal flow (no card data ever touches this app — PCI-DSS).
 * "Waiting" mimics the reader; on approval it records a real card payment with
 * the auth code as the provider reference and clears down; on decline the server
 * can retry or fall back to cash.
 */

const INK = '#111827';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';
const TEAL = '#0d7377';

type Phase = 'waiting' | 'approved' | 'declined';

interface CardPaymentProps {
  totals: OrderTotals;
  /** Force a decline on the first attempt (for demoing the failure path). */
  simulateDecline?: boolean;
  onCancel: () => void;
  onSwitchToCash: () => void;
  onApproved: (amountP: number, authCode: string) => void;
  onDone: () => void;
}

function randomAuth(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function CardPayment({
  totals,
  simulateDecline,
  onCancel,
  onSwitchToCash,
  onApproved,
  onDone,
}: CardPaymentProps) {
  const dueP = totals.outstandingP > 0 ? totals.outstandingP : totals.totalP;
  const [phase, setPhase] = useState<Phase>('waiting');
  const [attempt, setAttempt] = useState(0);
  const authCode = useMemo(randomAuth, [phase === 'approved']);
  const [countdown, setCountdown] = useState(3);

  // Simulate the reader: resolve after ~2.5s (decline only on the first attempt
  // when requested, so "Retry" then approves).
  useEffect(() => {
    if (phase !== 'waiting') return;
    const t = setTimeout(() => {
      setPhase(simulateDecline && attempt === 0 ? 'declined' : 'approved');
    }, 2500);
    return () => clearTimeout(t);
  }, [phase, attempt, simulateDecline]);

  // On approval: record the payment, then clear the till after a short countdown.
  useEffect(() => {
    if (phase !== 'approved') return;
    onApproved(dueP, authCode);
    setCountdown(3);
    const tick = setInterval(() => setCountdown((c) => c - 1), 1000);
    const done = setTimeout(() => {
      clearInterval(tick);
      onDone();
    }, 3000);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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
            Card Terminal Integration
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
          <p className="text-sm font-semibold" style={{ color: INK }}>
            Card Terminal Online
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-8 overflow-auto p-8">
        {phase === 'waiting' && (
          <div
            className="flex flex-col items-center justify-center gap-6 rounded-2xl border bg-white p-12"
            style={{ borderColor: BORDER }}
          >
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-base font-semibold uppercase" style={{ color: MUTED }}>
                Waiting for Transaction
              </p>
              <p className="text-[56px] font-extrabold leading-none" style={{ color: INK }}>
                {formatPence(pence(dueP))}
              </p>
              <p className="text-sm" style={{ color: MUTED }}>
                Terminal ID:{' '}
                <span className="font-semibold" style={{ color: INK }}>
                  INGENICO_POS_04A
                </span>
              </p>
            </div>

            {/* Concentric "present card" graphic */}
            <div className="relative flex h-[220px] w-[220px] items-center justify-center">
              <span
                className="absolute h-[220px] w-[220px] rounded-full border-2"
                style={{ borderColor: '#e5e7eb' }}
              />
              <span
                className="absolute h-[170px] w-[170px] animate-ping rounded-full border-2 opacity-60"
                style={{ borderColor: TEAL, animationDuration: '1.8s' }}
              />
              <span
                className="absolute h-[120px] w-[120px] rounded-full border-2"
                style={{ borderColor: '#a7d3d4' }}
              />
              <span
                className="relative flex h-20 w-20 items-center justify-center rounded-full"
                style={{ backgroundColor: '#eaf3f4', color: TEAL }}
              >
                <CardIcon className="h-9 w-9" />
              </span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <p className="text-[22px] font-bold" style={{ color: INK }}>
                Present card on terminal
              </p>
              <p className="text-[15px]" style={{ color: MUTED }}>
                Accepting Visa, Mastercard, Apple Pay, Google Pay
              </p>
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg px-6 py-3 text-sm font-bold"
              style={{ backgroundColor: '#fde8e8', color: '#9b1c1c' }}
            >
              Cancel Reader Session
            </button>
          </div>
        )}

        {phase === 'approved' && (
          <div
            className="flex flex-col gap-5 rounded-2xl border-[1.5px] bg-white p-8"
            style={{ borderColor: '#10b981' }}
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-2xl text-white"
                style={{ backgroundColor: '#10b981' }}
              >
                <CheckIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-lg font-bold" style={{ color: '#03543f' }}>
                  Payment Approved
                </p>
                <p className="text-xs" style={{ color: MUTED }}>
                  Auth Code:{' '}
                  <span className="font-semibold" style={{ color: INK }}>
                    {authCode}
                  </span>
                </p>
              </div>
            </div>
            <div className="h-px w-full" style={{ backgroundColor: BORDER }} />
            <div className="flex flex-col gap-3">
              <p className="text-[13px] font-semibold uppercase" style={{ color: MUTED }}>
                Print / Send Receipt Options
              </p>
              <div className="flex gap-2.5">
                <ReceiptBtn active icon={<PrinterIcon className="h-4 w-4" />} label="Print Receipt" />
                <ReceiptBtn icon={<MailIcon className="h-4 w-4" />} label="E-mail" />
                <ReceiptBtn icon={<MessageCircleIcon className="h-4 w-4" />} label="SMS Text" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1 w-10 rounded-sm" style={{ backgroundColor: '#10b981' }} />
              <p className="text-xs" style={{ color: MUTED }}>
                Clearing till in {countdown} second{countdown === 1 ? '' : 's'}…
              </p>
            </div>
          </div>
        )}

        {phase === 'declined' && (
          <div
            className="flex flex-col gap-5 rounded-2xl border-[1.5px] bg-white p-8"
            style={{ borderColor: '#ef4444' }}
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-2xl text-white"
                style={{ backgroundColor: '#ef4444' }}
              >
                <XCircleIcon className="h-4 w-4" />
              </span>
              <div style={{ color: '#9b1c1c' }}>
                <p className="text-lg font-bold">Payment Declined</p>
                <p className="text-xs">Error Code: 51 (Insufficient Funds)</p>
              </div>
            </div>
            <div className="h-px w-full" style={{ backgroundColor: BORDER }} />
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setAttempt((a) => a + 1);
                  setPhase('waiting');
                }}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-bold text-white"
                style={{ backgroundColor: '#ef4444' }}
              >
                <RefreshIcon className="h-4 w-4" />
                Retry Connection
              </button>
              <button
                type="button"
                onClick={onSwitchToCash}
                className="flex flex-1 items-center justify-center rounded-lg border px-4 py-3 text-sm font-semibold"
                style={{ borderColor: BORDER, color: INK }}
              >
                Switch to Cash
              </button>
            </div>
            <p className="text-xs" style={{ color: MUTED }}>
              Please ask the customer to try another physical card, or present an alternative
              payment method.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ReceiptBtn({
  active,
  icon,
  label,
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold"
      style={
        active
          ? { backgroundColor: TEAL, color: 'white' }
          : { backgroundColor: 'white', border: `1px solid ${BORDER}`, color: INK }
      }
    >
      {icon}
      {label}
    </button>
  );
}
