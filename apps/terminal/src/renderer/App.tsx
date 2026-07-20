import { useEffect, useState } from 'react';
import type { AppInfo, DbStatus } from '../shared/ipc-contract.js';

/**
 * Phase 1 scaffold screen. Proves the whole chain is wired: renderer ->
 * preload bridge -> main process -> SQLite, with context isolation intact.
 *
 * This gets replaced by the order screen next.
 */
export function App() {
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([window.pos.getDbStatus(), window.pos.getAppInfo()])
      .then(([status, info]) => {
        setDbStatus(status);
        setAppInfo(info);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">POS Terminal</h1>
          <p className="text-sm text-slate-400">Phase 1 scaffold</p>
        </div>

        {/*
          Connectivity is informational only — it must never gate the UI.
          The till trades identically whether this pill is green or amber.
        */}
        <div
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
            online ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
          }`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-400' : 'bg-amber-400'}`}
          />
          {online ? 'Online' : 'Offline — still trading'}
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-2xl">
          <div className="mb-8 text-center">
            <h2 className="mb-2 text-5xl font-bold tracking-tight">Hello POS</h2>
            <p className="text-slate-400">
              Local-first till. The cloud is synced to, never depended on.
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-300">
              <p className="font-medium">Bridge error</p>
              <p className="mt-1 text-sm">{error}</p>
            </div>
          )}

          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
              System status
            </h3>
            <dl className="space-y-3 text-sm">
              <StatusRow
                label="Local database"
                value={dbStatus?.ready ? 'Ready' : 'Not ready'}
                ok={dbStatus?.ready ?? false}
              />
              <StatusRow
                label="Schema version"
                value={dbStatus ? `v${dbStatus.schemaVersion}` : '—'}
                ok={(dbStatus?.schemaVersion ?? 0) > 0}
              />
              <StatusRow
                label="Tables"
                value={dbStatus ? String(dbStatus.tableCount) : '—'}
                ok={(dbStatus?.tableCount ?? 0) > 0}
              />
              <StatusRow label="Electron" value={appInfo?.electron ?? '—'} ok={!!appInfo} />
              <StatusRow label="Node" value={appInfo?.node ?? '—'} ok={!!appInfo} />
            </dl>

            {dbStatus?.path && (
              <p className="mt-4 break-all border-t border-slate-700 pt-4 font-mono text-xs text-slate-500">
                {dbStatus.path}
              </p>
            )}
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            Next: order screen — menu browse, modifiers, running VAT total.
          </p>
        </div>
      </main>
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-400">{label}</dt>
      <dd className={`font-medium ${ok ? 'text-emerald-300' : 'text-slate-500'}`}>{value}</dd>
    </div>
  );
}
