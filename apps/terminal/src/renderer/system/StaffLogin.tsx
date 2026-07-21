import { useEffect, useMemo, useState } from 'react';
import type {
  ClockDirection,
  StaffSummary,
  VerifyPinResult,
} from '../../shared/ipc-contract.js';
import { BackspaceIcon, UtensilsIcon } from '../order/icons';

/**
 * 01-TILL / 1.1 — Staff Login & Clock-In.
 *
 * Real auth: the roster comes from the till DB and the PIN is checked in the
 * main process (scrypt + lockout) — the hash never reaches the renderer. On
 * success the staff member is clocked in/out and handed to the shell.
 *
 * Colours match the Figma frame, which runs a slightly deeper ink/teal than the
 * order screen, so they're expressed here as literals rather than brand tokens.
 */

const INK = '#1a2e30';
const MUTED = '#526b6e';
const BORDER = '#d3e2e3';
const TEAL = '#0d7377';
const KEY_BG = '#e7f1f2';

interface StaffLoginProps {
  onLoggedIn: (staff: StaffSummary) => void;
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_COLOURS = ['#0d7377', '#7c3aed', '#c2410c', '#0891b2', '#be185d', '#4d7c0f'];
function avatarColour(id: string): string {
  let sum = 0;
  for (const ch of id) sum += ch.charCodeAt(0);
  return AVATAR_COLOURS[sum % AVATAR_COLOURS.length]!;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return {
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    date: now.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
  };
}

export function StaffLogin({ onLoggedIn }: StaffLoginProps) {
  const { time, date } = useClock();
  const [staff, setStaff] = useState<StaffSummary[]>([]);
  const [selected, setSelected] = useState<StaffSummary | null>(null);

  useEffect(() => {
    if (!window.pos) return;
    window.pos
      .listStaff()
      .then(setStaff)
      .catch(() => setStaff([]));
  }, []);

  return (
    <div
      className="flex h-full flex-col gap-10 p-12"
      style={{ backgroundColor: '#f2f6f6', color: INK }}
    >
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: TEAL }}
          >
            <UtensilsIcon className="h-7 w-7" />
          </div>
          <div className="leading-tight">
            <p className="text-[22px] font-bold" style={{ color: INK }}>
              THE WILD THYME CO.
            </p>
            <p className="text-xs font-semibold" style={{ color: TEAL }}>
              EST. 2014 • UK POS TERMINAL
            </p>
          </div>
        </div>
        <div className="text-right leading-tight">
          <p className="text-2xl font-bold" style={{ color: INK }}>
            {time}
          </p>
          <p className="text-sm font-medium" style={{ color: MUTED }}>
            {date}
          </p>
        </div>
      </header>

      {/* Staff grid */}
      <div className="flex flex-1 flex-col gap-6">
        <p className="text-xl font-semibold" style={{ color: MUTED }}>
          Select Staff Member to Login
        </p>
        <div className="grid grid-cols-4 gap-5">
          {staff.map((member) => {
            const isSelected = selected?.id === member.id;
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => setSelected(member)}
                className="flex h-[180px] flex-col items-center justify-center gap-4 rounded-xl bg-white p-5 transition-shadow hover:shadow-md"
                style={{
                  border: `${isSelected ? 2 : 1}px solid ${isSelected ? TEAL : BORDER}`,
                  boxShadow: '0px 4px 6px rgba(13,115,119,0.05)',
                }}
              >
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white"
                  style={{ backgroundColor: avatarColour(member.id) }}
                >
                  {initials(member.name)}
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold" style={{ color: INK }}>
                    {member.name}
                  </p>
                  <p className="text-sm font-medium uppercase" style={{ color: MUTED }}>
                    {member.role}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <PinModal
          staff={selected}
          onCancel={() => setSelected(null)}
          onLoggedIn={onLoggedIn}
        />
      )}
    </div>
  );
}

function PinModal({
  staff,
  onCancel,
  onLoggedIn,
}: {
  staff: StaffSummary;
  onCancel: () => void;
  onLoggedIn: (staff: StaffSummary) => void;
}) {
  const [pin, setPin] = useState('');
  const [direction, setDirection] = useState<ClockDirection>('in');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dotCount = Math.max(4, pin.length);
  const dots = useMemo(() => Array.from({ length: dotCount }), [dotCount]);

  const press = (digit: string) => {
    if (busy || pin.length >= 8) return;
    setError(null);
    setPin((p) => p + digit);
  };
  const backspace = () => {
    if (busy) return;
    setError(null);
    setPin((p) => p.slice(0, -1));
  };

  const confirm = async () => {
    if (busy) return;
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    setBusy(true);
    try {
      const result: VerifyPinResult = window.pos
        ? await window.pos.verifyPin(staff.id, pin)
        : { ok: false, lockedOut: false, attemptsRemaining: 0 };

      if (result.ok) {
        await window.pos?.punchClock(staff.id, direction);
        onLoggedIn(result.staff);
        return;
      }
      setPin('');
      setError(
        result.lockedOut
          ? `Locked — try again in ${result.secondsRemaining}s`
          : `Incorrect PIN — ${result.attemptsRemaining} attempt${
              result.attemptsRemaining === 1 ? '' : 's'
            } left`,
      );
    } finally {
      setBusy(false);
    }
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(26,46,48,0.6)' }}
    >
      <div
        className="flex w-[480px] flex-col items-center gap-7 rounded-2xl bg-white p-8"
        style={{ boxShadow: '0px 16px 16px rgba(0,0,0,0.2)' }}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white"
            style={{ backgroundColor: avatarColour(staff.id) }}
          >
            {initials(staff.name)}
          </div>
          <p className="text-2xl font-bold" style={{ color: INK }}>
            {staff.name}
          </p>
          <p
            className="text-sm font-medium uppercase"
            style={{ color: error ? '#dc2626' : MUTED }}
          >
            {error ?? 'Enter Security PIN'}
          </p>
        </div>

        {/* PIN indicators */}
        <div className="flex h-4 items-center gap-4">
          {dots.map((_, i) => (
            <span
              key={i}
              className="h-4 w-4 rounded-full"
              style={{
                backgroundColor: i < pin.length ? TEAL : 'transparent',
                border: `2px solid ${i < pin.length ? TEAL : BORDER}`,
              }}
            />
          ))}
        </div>

        {/* Keypad */}
        <div className="flex flex-col items-center gap-3">
          <div className="grid grid-cols-3 gap-3">
            {keys.map((k) => (
              <Key key={k} onClick={() => press(k)}>
                <span className="text-[28px] font-semibold" style={{ color: INK }}>
                  {k}
                </span>
              </Key>
            ))}
            <Key onClick={backspace} tinted>
              <span style={{ color: INK }}>
                <BackspaceIcon className="h-6 w-6" />
              </span>
            </Key>
            <Key onClick={() => press('0')}>
              <span className="text-[28px] font-semibold" style={{ color: INK }}>
                0
              </span>
            </Key>
            <Key onClick={confirm} tinted>
              <span className="text-lg font-semibold" style={{ color: TEAL }}>
                Confirm
              </span>
            </Key>
          </div>
        </div>

        {/* Clock in/out toggle */}
        <div className="w-full border-t pt-3" style={{ borderColor: BORDER }}>
          <div
            className="flex h-[54px] items-center rounded-[27px] p-1"
            style={{ backgroundColor: '#f2f6f6' }}
          >
            {(['in', 'out'] as ClockDirection[]).map((dir) => {
              const active = direction === dir;
              return (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setDirection(dir)}
                  className="flex h-full flex-1 items-center justify-center rounded-[23px] text-sm font-semibold"
                  style={
                    active
                      ? { backgroundColor: TEAL, color: 'white' }
                      : { color: MUTED }
                  }
                >
                  {dir === 'in' ? 'CLOCK IN' : 'CLOCK OUT'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Cancel */}
        <button
          type="button"
          onClick={onCancel}
          className="flex h-[54px] w-full items-center justify-center rounded-[10px] border bg-white text-lg font-semibold"
          style={{ borderColor: BORDER, color: TEAL }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Key({
  children,
  onClick,
  tinted,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tinted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-20 w-[100px] items-center justify-center rounded-[10px] border active:scale-95"
      style={{ borderColor: BORDER, backgroundColor: tinted ? KEY_BG : 'white' }}
    >
      {children}
    </button>
  );
}
