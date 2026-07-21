/**
 * Phase 0 KDS placeholder — proves the dark, wall-mounted shell boots and the
 * shared design tokens resolve. The live order board (New / In Progress / Ready,
 * colour-coded by wait time, bump/recall) arrives in Phase 2 over WebSocket.
 */
const COLUMNS = [
  { key: 'new', label: 'NEW', accent: 'text-amber-400', count: 0 },
  { key: 'in_progress', label: 'IN PROGRESS', accent: 'text-sky-400', count: 0 },
  { key: 'ready', label: 'READY', accent: 'text-emerald-400', count: 0 },
] as const;

export function App() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-kds-border px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500 font-bold text-white">
            K
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Kitchen Display</h1>
            <p className="text-xs text-slate-400">Grill Station · London Soho Central</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          Awaiting live feed (Phase 2)
        </div>
      </header>

      <main className="grid flex-1 grid-cols-3 gap-4 p-6">
        {COLUMNS.map((col) => (
          <section
            key={col.key}
            className="flex flex-col rounded-xl border border-kds-border bg-kds-surface"
          >
            <div className="flex items-center justify-between border-b border-kds-border px-5 py-3">
              <h2 className={`text-sm font-bold tracking-widest ${col.accent}`}>{col.label}</h2>
              <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs font-semibold text-slate-400">
                {col.count}
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-slate-500">
              No tickets yet
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
