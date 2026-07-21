import type { Migration } from '../migrate.js';

/**
 * Adds the dine-in floor plan (screen 1.3). Append-only: never edit 001.
 */
export const migration002: Migration = {
  version: 2,
  name: 'dining_tables',
  up: `
    CREATE TABLE dining_tables (
      id          TEXT PRIMARY KEY,
      location_id TEXT NOT NULL,
      area        TEXT NOT NULL,
      number      TEXT NOT NULL,
      seats       INTEGER NOT NULL,
      shape       TEXT NOT NULL DEFAULT 'square',
      pos_x       INTEGER NOT NULL DEFAULT 0,
      pos_y       INTEGER NOT NULL DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'available',
      covers      INTEGER NOT NULL DEFAULT 0,
      seated_at   TEXT,
      updated_at  TEXT NOT NULL
    );

    CREATE INDEX idx_dining_tables_location ON dining_tables(location_id, area);
  `,
};
