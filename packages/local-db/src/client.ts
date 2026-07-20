import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as schema from './schema/index.js';

export type PosDatabase = BetterSQLite3Database<typeof schema>;

export interface OpenDbOptions {
  /** Absolute path to the .sqlite file, or ':memory:' for tests. */
  path: string;
  /** Log every statement. Dev only — never enable where payloads are logged. */
  verbose?: boolean;
  /** Override the native binding path. Normally resolved automatically. */
  nativeBinding?: string;
}

/**
 * better-sqlite3 is V8-ABI-bound, not N-API, so Electron and Node need
 * separately compiled binaries. `scripts/rebuild-native.mjs` builds both into
 * `.native/`; pick whichever matches the current runtime.
 *
 * Falls back to better-sqlite3's own resolution when the cache is absent —
 * that is the case in a packaged app, where only one ABI ships.
 */
function resolveNativeBinding(): string | undefined {
  const runtime = process.versions.electron ? 'electron' : 'node';

  // packages/local-db/src -> repo root
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const candidate = path.join(repoRoot, '.native', runtime, 'better_sqlite3.node');

  return existsSync(candidate) ? candidate : undefined;
}

/**
 * Open the till's local database.
 *
 * The pragmas here are the difference between a till that survives a power cut
 * mid-service and one that loses the last few orders. A POS runs on cheap
 * hardware behind a counter that gets unplugged; assume ungraceful shutdown is
 * the normal case, not the exception.
 */
export function openDatabase(options: OpenDbOptions): {
  db: PosDatabase;
  sqlite: Database.Database;
} {
  const nativeBinding = options.nativeBinding ?? resolveNativeBinding();

  const sqlite = new Database(options.path, {
    ...(options.verbose ? { verbose: console.log } : {}),
    ...(nativeBinding ? { nativeBinding } : {}),
  });

  // WAL: readers never block the writer. The order screen keeps rendering
  // while the sync worker writes.
  sqlite.pragma('journal_mode = WAL');

  // FULL, not NORMAL. NORMAL can lose recently-committed transactions on power
  // loss; for money that is not an acceptable trade. The write volume of a
  // single till is nowhere near enough for the fsync cost to matter.
  sqlite.pragma('synchronous = FULL');

  // Enforce the references declared in the schema.
  sqlite.pragma('foreign_keys = ON');

  // Fail fast rather than hanging the UI if another process holds a lock.
  sqlite.pragma('busy_timeout = 5000');

  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export { schema };
