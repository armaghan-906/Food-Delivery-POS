import type { Migration } from '../migrate.js';
import { migration001 } from './001_initial.js';
import { migration002 } from './002_dining_tables.js';

/**
 * Ordered list of every migration. Append only — an applied migration is
 * history and must never be edited or renumbered.
 */
export const MIGRATIONS: Migration[] = [migration001, migration002];
