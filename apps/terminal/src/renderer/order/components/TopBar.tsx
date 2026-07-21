import { useEffect, useState } from 'react';
import type { OrderChannel } from '@pos/types';
import type { Staff } from '../useOrder';
import { MenuIcon, UtensilsIcon } from '../icons';

const CHANNELS: { id: OrderChannel; label: string }[] = [
  { id: 'dine_in', label: 'Dine-In' },
  { id: 'takeaway', label: 'Takeaway' },
  { id: 'delivery', label: 'Delivery' },
];

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function useClock(): { time: string; date: string } {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);
  return {
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    date: now.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
  };
}

interface TopBarProps {
  staff: Staff;
  channel: OrderChannel;
  online: boolean;
  tableLabel?: string | undefined;
  onChannelChange: (channel: OrderChannel) => void;
  onMenu?: () => void;
}

export function TopBar({ staff, channel, online, tableLabel, onChannelChange, onMenu }: TopBarProps) {
  const { time, date } = useClock();
  const roleLabel = staff.role.charAt(0).toUpperCase() + staff.role.slice(1);

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-line bg-white px-5">
      {/* Staff */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
          {initials(staff.name)}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-[15px] font-bold text-ink">{staff.name}</div>
          <div className="truncate text-xs text-subtle">Role: {roleLabel} (POS Till 01)</div>
        </div>
      </div>

      {/* Centre: table + channel switcher */}
      <div className="flex flex-1 items-center justify-center gap-3">
        {channel === 'dine_in' && tableLabel && (
          <div className="flex items-center gap-2 rounded-lg border border-brand-500 px-3.5 py-2 text-[13px] font-semibold text-brand-700">
            <UtensilsIcon className="h-4 w-4" />
            {tableLabel}
          </div>
        )}
        <div className="flex items-center gap-1 rounded-xl bg-canvas p-1">
          {CHANNELS.map((c) => {
            const active = c.id === channel;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChannelChange(c.id)}
                className={`rounded-lg px-5 py-2 text-[13px] font-semibold transition-colors ${
                  active
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-subtle hover:text-ink'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: kitchen sync, clock, menu */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-[13px] font-medium text-subtle">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              online ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          {online ? 'Kitchen Sync Online' : 'Offline — still trading'}
        </div>
        <div className="text-right leading-tight">
          <div className="text-[15px] font-bold text-ink">{time}</div>
          <div className="text-xs text-subtle">{date}</div>
        </div>
        <button
          type="button"
          onClick={onMenu}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-subtle hover:bg-canvas"
          aria-label="Menu"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
