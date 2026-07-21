import { useState } from 'react';
import { formatPence, pence } from '@pos/types';
import type { HeldOrder, Staff } from '../useOrder';
import { SearchIcon } from '../icons';

/**
 * 01-TILL / 1.13 — Open Tabs & Held Orders.
 *
 * Lists the real parked orders (from `useOrder.heldOrders`). Recall reloads a
 * held order as the current one; Void discards it. Hold/Recall snapshot the
 * actual event log, so a recalled order resumes exactly where it was left.
 */

const INK = '#1e2525';
const MUTED = '#515e5e';
const FAINT = '#879999';
const BORDER = '#d2dbdb';
const TEAL = '#0d7377';
const AMBER = '#d97706';

const TABS = ['Refund', 'Receipt Preview', 'EOD Cash-Up', 'Open Tabs'];

const CHANNEL_LABEL: Record<string, string> = {
  dine_in: 'DINE-IN',
  takeaway: 'TAKEAWAY',
  delivery: 'DELIVERY',
};

function heldAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `Held: ${mins} min ago`;
  return `Held: ${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

interface OpenTabsScreenProps {
  heldOrders: HeldOrder[];
  staff: Staff;
  onBack: () => void;
  onTab: (tab: string) => void;
  onRecall: (id: string) => void;
  onVoid: (id: string) => void;
}

export function OpenTabsScreen({ heldOrders, staff, onBack, onTab, onRecall, onVoid }: OpenTabsScreenProps) {
  const [query, setQuery] = useState('');
  const filtered = heldOrders.filter((h) =>
    h.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: '#edf2f2' }}>
      {/* Header */}
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
              onClick={t === 'Open Tabs' ? undefined : () => onTab(t)}
              className="rounded-lg px-4 py-3 text-sm font-semibold"
              style={t === 'Open Tabs' ? { backgroundColor: '#e6f2f2', border: `1px solid ${TEAL}`, color: TEAL } : { color: MUTED }}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-base font-semibold" style={{ color: INK }}>
          Server: {staff.name}
        </p>
      </header>

      {/* Filters */}
      <div className="flex shrink-0 items-center justify-between border-b bg-white px-6 py-4" style={{ borderColor: BORDER }}>
        <div className="flex gap-2">
          <FilterPill active label={`All Active (${heldOrders.length})`} />
          <FilterPill label={`Held Orders (${heldOrders.length})`} />
          <FilterPill label="Open Tables / Tabs (0)" />
        </div>
        <div className="flex h-12 w-[400px] items-center gap-2 rounded-lg border px-3" style={{ borderColor: BORDER, backgroundColor: '#f3f7f7' }}>
          <span style={{ color: FAINT }}>
            <SearchIcon className="h-[18px] w-[18px]" />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search table or tab name…"
            className="w-full bg-transparent text-sm outline-none"
            style={{ color: INK }}
          />
        </div>
      </div>

      {/* Held grid */}
      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-lg font-bold" style={{ color: INK }}>
              No held orders
            </p>
            <p className="mt-1 text-sm" style={{ color: MUTED }}>
              Use “Hold” on the order screen to park a tab here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-5">
            {filtered.map((h) => (
              <div key={h.id} className="flex flex-col gap-3 rounded-xl border bg-white p-5" style={{ borderColor: BORDER }}>
                <div className="flex items-center justify-between">
                  <p className="text-lg font-extrabold" style={{ color: INK }}>
                    {h.label}
                  </p>
                  <span
                    className="rounded-md px-2.5 py-1 text-xs font-bold"
                    style={
                      h.channel === 'dine_in'
                        ? { backgroundColor: '#e6f2f2', color: TEAL }
                        : { backgroundColor: '#f3f7f7', border: `1px solid ${BORDER}`, color: MUTED }
                    }
                  >
                    {CHANNEL_LABEL[h.channel]}
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-sm">
                  <p style={{ color: MUTED }}>
                    {h.itemCount} item{h.itemCount === 1 ? '' : 's'}
                  </p>
                  <p style={{ color: MUTED }}>Server: {staff.name}</p>
                  <p className="font-bold" style={{ color: AMBER }}>
                    {heldAgo(h.heldAt)}
                  </p>
                </div>
                <div className="h-px w-full" style={{ backgroundColor: BORDER }} />
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: MUTED }}>
                    Est. Total
                  </span>
                  <span className="text-xl font-extrabold" style={{ color: INK }}>
                    {formatPence(pence(h.totalP))}
                  </span>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => onRecall(h.id)}
                    className="flex h-16 flex-1 items-center justify-center rounded-lg text-base font-bold text-white"
                    style={{ backgroundColor: TEAL }}
                  >
                    Recall
                  </button>
                  <button
                    type="button"
                    className="flex h-16 w-[100px] items-center justify-center rounded-lg border text-base font-bold"
                    style={{ borderColor: BORDER, color: INK }}
                  >
                    Merge
                  </button>
                  <button
                    type="button"
                    onClick={() => onVoid(h.id)}
                    className="flex h-16 w-[84px] items-center justify-center rounded-lg border text-base font-bold"
                    style={{ borderColor: BORDER, color: INK }}
                  >
                    Void
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterPill({ active, label }: { active?: boolean; label: string }) {
  return (
    <span
      className="rounded-lg px-5 py-3 text-sm font-bold"
      style={
        active
          ? { backgroundColor: TEAL, color: 'white' }
          : { backgroundColor: '#f3f7f7', border: `1px solid ${BORDER}`, color: MUTED }
      }
    >
      {label}
    </span>
  );
}
