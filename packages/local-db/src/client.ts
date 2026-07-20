import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/index.js';

export type PosDatabase = BetterSQLite3Database<typeof schema>;

export interface OpenDbOptions {
  /** Absolute path to the .sqlite file, or ':memory:' for tests. */
  path: string;
  /** Log every statement. Dev only — never enable where payloads are logged. */
  verbose?: boolean;
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
  const sqlite = new Database(options.path, {
    ...(options.verbose ? { verbose: console.log } : {}),
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
