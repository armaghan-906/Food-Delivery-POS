import type { Migration } from '../migrate.js';
import { migration001 } from './001_initial.js';

/**
 * Ordered list of every migration. Append only — an applied migration is
 * history and must never be edited or renumbered.
 */
export const MIGRATIONS: Migration[] = [migration001];
