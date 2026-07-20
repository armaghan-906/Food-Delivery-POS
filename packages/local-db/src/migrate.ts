import type Database from 'better-sqlite3';

export interface Migration {
  /** Monotonic. Never renumber, never reorder, never edit an applied migration. */
  version: number;
  name: string;
  up: string;
}

/**
 * Deliberately hand-rolled rather than drizzle-kit's runner.
 *
 * Migrations ship inside a packaged Electron app and run against a database
 * holding real trading data, on a machine with no developer present. We need
 * them embedded in the bundle (not read from disk), applied in one transaction,
 * and recorded in a table we control. This is ~40 lines and removes a class of
 * packaging problem.
 */

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS _migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );
`;

export function runMigrations(sqlite: Database.Database, migrations: Migration[]): number[] {
  sqlite.exec(MIGRATIONS_TABLE);

  const applied = new Set(
    sqlite.prepare('SELECT version FROM _migrations').all().map((r) => (r as { version: number }).version),
  );

  const pending = migrations
    .filter((m) => !applied.has(m.version))
    .sort((a, b) => a.version - b.version);

  const record = sqlite.prepare(
    'INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)',
  );

  const executed: number[] = [];

  for (const migration of pending) {
    // Each migration is atomic on its own. If migration 3 fails, 1 and 2 stay
    // applied and the app can report exactly where it stopped — better than an
    // all-or-nothing rollback that leaves no diagnostic.
    const apply = sqlite.transaction(() => {
      sqlite.exec(migration.up);
      record.run(migration.version, migration.name, new Date().toISOString());
    });

    try {
      apply();
      executed.push(migration.version);
    } catch (error) {
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }

  return executed;
}

export function currentVersion(sqlite: Database.Database): number {
  sqlite.exec(MIGRATIONS_TABLE);
  const row = sqlite.prepare('SELECT MAX(version) AS v FROM _migrations').get() as
    | { v: number | null }
    | undefined;
  return row?.v ?? 0;
}
