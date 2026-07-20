export { openDatabase, schema, type PosDatabase, type OpenDbOptions } from './client.js';
export { runMigrations, currentVersion, type Migration } from './migrate.js';
export { MIGRATIONS } from './migrations/index.js';

import { openDatabase, type OpenDbOptions, type PosDatabase } from './client.js';
import { runMigrations } from './migrate.js';
import { MIGRATIONS } from './migrations/index.js';
import type Database from 'better-sqlite3';

/**
 * Open the till database and bring it up to the current schema version.
 * This is the one call the Electron main process should make on boot.
 */
export function initialiseDatabase(options: OpenDbOptions): {
  db: PosDatabase;
  sqlite: Database.Database;
  applied: number[];
} {
  const { db, sqlite } = openDatabase(options);
  const applied = runMigrations(sqlite, MIGRATIONS);
  return { db, sqlite, applied };
}
