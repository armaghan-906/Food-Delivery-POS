import { useEffect, useMemo, useState } from 'react';
import type { TableInfo, TableStatus } from '../../shared/ipc-contract.js';
import {
  MoveIcon,
  ReceiptIcon,
  SparklesIcon,
  TableGridIcon,
} from '../order/icons';

/**
 * 01-TILL / 1.3 — Table Floor Plan.
 *
 * Real state: tables and their status come from the till DB. "Mark as Clean"
 * persists through IPC; selecting a table and opening it hands off to the order
 * screen for that cover.
 */

const AREAS: { id: string; label: string }[] = [
  { id: 'main', label: 'Main Dining' },
  { id: 'bar', label: 'Bar Area' },
  { id: 'terrace', label: 'Terrace' },
];

const LEGEND: { status: TableStatus; label: string; colour: string }[] = [
  { status: 'available', label: 'Available', colour: '#4caf50' },
  { status: 'occupied', label: 'Occupied', colour: '#0d7377' },
  { status: 'bill_requested', label: 'Bill Requested', colour: '#ffb300' },
  { status: 'needs_clean', label: 'Needs Clean', colour: '#ef4444' },
];

interface StatusStyle {
  bg: string;
  border: string;
  text: string;
  sub: string;
}
function styleFor(status: TableStatus): StatusStyle {
  switch (status) {
    case 'occupied':
      return { bg: '#0d7377', border: '#0d7377', text: '#ffffff', sub: 'rgba(255,255,255,0.7)' };
    case 'bill_requested':
      return { bg: 'rgba(255,179,0,0.13)', border: '#ffb300', text: '#1a202c', sub: '#64748b' };
    case 'needs_clean':
      return { bg: 'rgba(239,68,68,0.08)', border: '#ef4444', text: '#1a202c', sub: '#64748b' };
    case 'available':
    default:
      return { bg: 'rgba(76,175,80,0.08)', border: '#4caf50', text: '#1a202c', sub: '#64748b' };
  }
}

function seatedLabel(seatedAt: string | null): string | null {
  if (!seatedAt) return null;
  const mins = Math.max(0, Math.floor((Date.now() - new Date(seatedAt).getTime()) / 60_000));
  if (mins < 60) return `seated ${mins}m`;
  return `seated ${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const STATUS_LABEL: Record<TableStatus, string> = {
  available: 'AVAILABLE',
  occupied: 'OCCUPIED',
  bill_requested: 'BILL REQUESTED',
  needs_clean: 'NEEDS CLEAN',
};

interface FloorPlanProps {
  onOpenTable: (table: TableInfo) => void;
}

export function FloorPlan({ onOpenTable }: FloorPlanProps) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [area, setArea] = useState('main');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!window.pos) return;
    window.pos
      .listTables()
      .then((rows) => {
        setTables(rows);
        const firstBusy = rows.find((t) => t.status === 'occupied') ?? rows[0];
        setSelectedId(firstBusy?.id ?? null);
      })
      .catch(() => setTables([]));
  }, []);

  const areaTables = useMemo(() => tables.filter((t) => t.area === area), [tables, area]);
  const selected = tables.find((t) => t.id === selectedId) ?? null;

  const stats = useMemo(() => {
    const busy = tables.filter((t) => t.status === 'occupied' || t.status === 'bill_requested');
    const covers = tables.reduce((sum, t) => sum + t.covers, 0);
    const durations = busy
      .map((t) => (t.seatedAt ? (Date.now() - new Date(t.seatedAt).getTime()) / 60_000 : null))
      .filter((n): n is number => n !== null);
    const avgTurn =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;
    const pct = tables.length > 0 ? Math.round((busy.length / tables.length) * 100) : 0;
    return { busy: busy.length, total: tables.length, covers, avgTurn, pct };
  }, [tables]);

  const markClean = async () => {
    if (!selected || !window.pos) return;
    const updated = await window.pos.setTableStatus(selected.id, 'available');
    if (updated) setTables((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* Header */}
      <header className="flex h-[88px] shrink-0 items-center justify-between border-b border-line bg-white px-6">
        <div className="flex items-center gap-12">
          <div className="flex items-center gap-3">
            <span className="text-brand-500">
              <TableGridIcon className="h-8 w-8" />
            </span>
            <h1 className="text-2xl font-extrabold" style={{ color: '#1a202c' }}>
              TABLE PLAN
            </h1>
          </div>
          <div className="flex gap-2">
            {AREAS.map((a) => {
              const active = a.id === area;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setArea(a.id)}
                  className="rounded-lg border px-5 py-3 text-base font-bold"
                  style={
                    active
                      ? { backgroundColor: 'rgba(13,115,119,0.1)', borderColor: '#0d7377', color: '#0d7377' }
                      : { backgroundColor: 'transparent', borderColor: 'transparent', color: '#64748b' }
                  }
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {LEGEND.map((l) => (
            <div key={l.status} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.colour }} />
              <span className="text-[13px]" style={{ color: '#64748b' }}>
                {l.label}
              </span>
            </div>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Map + stats */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex-1 overflow-auto bg-white p-10">
            {areaTables.map((t) => {
              const s = styleFor(t.status);
              const seated = seatedLabel(t.seatedAt);
              const isSelected = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className="absolute flex flex-col items-center justify-center gap-1"
                  style={{
                    left: t.posX,
                    top: t.posY,
                    width: 120,
                    height: 120,
                    borderRadius: t.shape === 'round' ? 60 : 12,
                    backgroundColor: s.bg,
                    border: `3px solid ${s.border}`,
                    boxShadow: isSelected ? `0 0 0 4px rgba(13,115,119,0.25)` : 'none',
                  }}
                >
                  <span className="text-[20px] font-extrabold" style={{ color: s.text }}>
                    {t.number}
                  </span>
                  <span className="text-[12px] font-semibold" style={{ color: s.sub }}>
                    {t.covers}/{t.seats} Pax
                  </span>
                  {seated && (
                    <span className="text-[11px]" style={{ color: s.sub }}>
                      {seated}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Stats bar */}
          <div className="flex h-20 shrink-0 items-center justify-between border-t border-line bg-white px-8">
            <div className="flex gap-10">
              <Stat label="OCCUPIED TABLES">
                {stats.busy} / {stats.total}{' '}
                <span className="text-[15px] font-medium" style={{ color: '#64748b' }}>
                  ({stats.pct}% Full)
                </span>
              </Stat>
              <Stat label="TOTAL COVERS">{stats.covers} Pax</Stat>
              <Stat label="AVG TURN TIME">{stats.avgTurn} Min</Stat>
            </div>
            <button
              type="button"
              className="rounded-lg border border-line px-4 py-2.5 text-sm font-bold"
              style={{ color: '#1a202c' }}
            >
              FLOOR OPTIONS
            </button>
          </div>
        </div>

        {/* Detail panel */}
        <aside className="flex w-[480px] shrink-0 flex-col gap-6 border-l border-line bg-white p-6">
          {selected ? (
            <TableDetail
              table={selected}
              onOpen={() => onOpenTable(selected)}
              onMarkClean={markClean}
            />
          ) : (
            <p className="text-sm" style={{ color: '#64748b' }}>
              Select a table to see its details.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function TableDetail({
  table,
  onOpen,
  onMarkClean,
}: {
  table: TableInfo;
  onOpen: () => void;
  onMarkClean: () => void;
}) {
  const seated = seatedLabel(table.seatedAt);
  const busy = table.status === 'occupied' || table.status === 'bill_requested';
  const areaLabel = AREAS.find((a) => a.id === table.area)?.label ?? table.area;

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[28px] font-extrabold" style={{ color: '#1a202c' }}>
            Table {table.number.replace(/^T-?/, '')}
          </h2>
          <p className="text-[15px]" style={{ color: '#64748b' }}>
            {areaLabel} • Seat Cover {table.covers}/{table.seats}
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1.5 text-[13px] font-bold"
          style={{ backgroundColor: 'rgba(13,115,119,0.1)', color: '#0d7377' }}
        >
          {STATUS_LABEL[table.status]}
        </span>
      </div>

      <div className="h-px w-full bg-line" />

      {/* Table state (real). Itemised order arrives when order persistence lands. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-base font-extrabold" style={{ color: '#1a202c' }}>
            {busy ? 'ACTIVE COVER' : 'TABLE FREE'}
          </p>
          {seated && (
            <p className="text-sm font-semibold" style={{ color: '#64748b' }}>
              Seated {seated.replace('seated ', '')} ago
            </p>
          )}
        </div>
        <p className="text-[15px]" style={{ color: '#64748b' }}>
          {busy
            ? `${table.covers} guest${table.covers === 1 ? '' : 's'} seated. Open the table to view or build the order.`
            : 'This table is ready for a new party.'}
        </p>
      </div>

      <div className="h-px w-full bg-line" />

      {/* Quick actions */}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-extrabold" style={{ color: '#64748b' }}>
          QUICK ACTIONS
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[10px] text-base font-bold text-white"
          style={{ backgroundColor: '#0d7377' }}
        >
          <ReceiptIcon className="h-5 w-5" />
          {busy ? 'VIEW FULL ORDER' : 'OPEN TABLE'}
        </button>
        <button
          type="button"
          className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[10px] border border-line text-base font-bold"
          style={{ color: '#1a202c' }}
        >
          <MoveIcon className="h-5 w-5" />
          MOVE / SWAP TABLE
        </button>
        <button
          type="button"
          onClick={onMarkClean}
          className="flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[10px] border border-line text-base font-bold"
          style={{ color: '#1a202c' }}
        >
          <SparklesIcon className="h-5 w-5" />
          MARK AS CLEAN
        </button>
      </div>
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xs font-bold" style={{ color: '#64748b' }}>
        {label}
      </p>
      <p className="text-[22px] font-extrabold" style={{ color: '#1a202c' }}>
        {children}
      </p>
    </div>
  );
}
