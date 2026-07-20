import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { SyncEntity, SyncQueueItem, SyncStatus } from '@pos/types';

/**
 * The outbox (ADR-004).
 *
 * Every local write bound for the cloud is enqueued here in the SAME
 * transaction as the write itself. That is the whole point of the pattern: if
 * the order event is committed, its queue row is committed too, so nothing can
 * be persisted locally and silently never reach the cloud.
 *
 * Delivery is at-least-once. The cloud dedupes on `entity_id`.
 */

export interface EnqueueInput {
  entity: SyncEntity;
  /** UUID of the record — becomes the cloud's idempotency key. */
  entityId: string;
  payload: unknown;
}

/**
 * Enqueue within an existing transaction.
 *
 * Takes the raw `Database` rather than opening its own transaction, so callers
 * can compose it with the domain write. Enqueuing separately would reintroduce
 * exactly the gap the outbox exists to close.
 */
export function enqueue(sqlite: Database.Database, input: EnqueueInput): string {
  const id = randomUUID();
  sqlite
    .prepare(
      `INSERT INTO sync_queue (id, entity, entity_id, payload, status, attempts, created_at)
       VALUES (?, ?, ?, ?, 'pending', 0, ?)`,
    )
    .run(id, input.entity, input.entityId, JSON.stringify(input.payload), new Date().toISOString());
  return id;
}

function toItem(row: Record<string, unknown>): SyncQueueItem {
  return {
    id: row['id'] as string,
    entity: row['entity'] as SyncEntity,
    entityId: row['entity_id'] as string,
    payload: row['payload'] as string,
    status: row['status'] as SyncStatus,
    attempts: row['attempts'] as number,
    lastError: (row['last_error'] as string | null) ?? null,
    nextAttemptAt: (row['next_attempt_at'] as string | null) ?? null,
    createdAt: row['created_at'] as string,
    syncedAt: (row['synced_at'] as string | null) ?? null,
  };
}

/**
 * Claim a batch of due items and mark them in_flight, atomically.
 *
 * The claim must be atomic or two worker ticks that overlap will send the same
 * rows twice. The cloud would dedupe them, but it wastes bandwidth on a
 * connection that is often the constraint.
 *
 * Rows are returned oldest-first so order events reach the cloud roughly in
 * the order they happened — not required for correctness (replay sorts by
 * sequence) but it makes live dashboards far less confusing.
 */
export function claimBatch(
  sqlite: Database.Database,
  batchSize: number,
  now: Date = new Date(),
): SyncQueueItem[] {
  const nowIso = now.toISOString();

  const claim = sqlite.transaction((): SyncQueueItem[] => {
    const rows = sqlite
      .prepare(
        `SELECT * FROM sync_queue
         WHERE status = 'pending'
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(nowIso, batchSize) as Record<string, unknown>[];

    if (rows.length === 0) return [];

    const mark = sqlite.prepare("UPDATE sync_queue SET status = 'in_flight' WHERE id = ?");
    for (const row of rows) mark.run(row['id']);

    return rows.map(toItem);
  });

  return claim();
}

/** Mark items delivered. */
export function markSynced(sqlite: Database.Database, ids: string[], now: Date = new Date()): void {
  if (ids.length === 0) return;
  const stmt = sqlite.prepare(
    "UPDATE sync_queue SET status = 'synced', synced_at = ?, last_error = NULL WHERE id = ?",
  );
  const run = sqlite.transaction(() => {
    for (const id of ids) stmt.run(now.toISOString(), id);
  });
  run();
}

/**
 * Exponential backoff with a ceiling: 2s, 4s, 8s … capped at 5 minutes.
 *
 * Capped because a till may be offline for hours — an uncapped exponential
 * would push the next attempt days out and the queue would not drain promptly
 * when the connection returned.
 */
export function backoffMs(attempts: number): number {
  const base = 2000 * 2 ** Math.max(0, attempts - 1);
  return Math.min(base, 5 * 60 * 1000);
}

/**
 * Return items to pending with backoff.
 *
 * Failures go back to `pending`, never to a terminal state. A till that cannot
 * reach the cloud for a day must still deliver everything afterwards —
 * discarding a payment because the network was down would be losing money.
 */
export function markFailed(
  sqlite: Database.Database,
  failures: Array<{ id: string; error: string }>,
  now: Date = new Date(),
): void {
  if (failures.length === 0) return;

  const stmt = sqlite.prepare(
    `UPDATE sync_queue
     SET status = 'pending',
         attempts = attempts + 1,
         last_error = ?,
         next_attempt_at = ?
     WHERE id = ?`,
  );

  const run = sqlite.transaction(() => {
    for (const failure of failures) {
      const current = sqlite
        .prepare('SELECT attempts FROM sync_queue WHERE id = ?')
        .get(failure.id) as { attempts: number } | undefined;

      const nextAttempts = (current?.attempts ?? 0) + 1;
      const nextAt = new Date(now.getTime() + backoffMs(nextAttempts)).toISOString();

      stmt.run(failure.error.slice(0, 500), nextAt, failure.id);
    }
  });
  run();
}

/**
 * Permanently reject items the cloud refused for a reason retrying cannot fix
 * (malformed payload, unknown entity). Kept in the table rather than deleted —
 * a rejected revenue record is something a human must see.
 */
export function markRejected(
  sqlite: Database.Database,
  failures: Array<{ id: string; error: string }>,
): void {
  if (failures.length === 0) return;
  const stmt = sqlite.prepare(
    "UPDATE sync_queue SET status = 'failed', last_error = ? WHERE id = ?",
  );
  const run = sqlite.transaction(() => {
    for (const f of failures) stmt.run(f.error.slice(0, 500), f.id);
  });
  run();
}

/**
 * Release in_flight rows back to pending.
 *
 * Called on startup: anything left in_flight means the app died mid-send. The
 * safe assumption is that it never arrived, so resend — the cloud dedupes.
 */
export function releaseStaleInFlight(sqlite: Database.Database): number {
  const result = sqlite
    .prepare("UPDATE sync_queue SET status = 'pending' WHERE status = 'in_flight'")
    .run();
  return result.changes;
}

export interface QueueStats {
  pending: number;
  inFlight: number;
  synced: number;
  failed: number;
  oldestPendingAt: string | null;
}

/** Queue health. Surfaced in the UI so staff can see sync falling behind. */
export function queueStats(sqlite: Database.Database): QueueStats {
  const rows = sqlite
    .prepare('SELECT status, COUNT(*) AS n FROM sync_queue GROUP BY status')
    .all() as Array<{ status: SyncStatus; n: number }>;

  const byStatus = new Map(rows.map((r) => [r.status, r.n]));

  const oldest = sqlite
    .prepare(
      "SELECT created_at FROM sync_queue WHERE status IN ('pending','in_flight') ORDER BY created_at ASC LIMIT 1",
    )
    .get() as { created_at: string } | undefined;

  return {
    pending: byStatus.get('pending') ?? 0,
    inFlight: byStatus.get('in_flight') ?? 0,
    synced: byStatus.get('synced') ?? 0,
    failed: byStatus.get('failed') ?? 0,
    oldestPendingAt: oldest?.created_at ?? null,
  };
}

/**
 * Prune delivered rows older than the retention window.
 *
 * Only `synced` rows — pending and failed must never be pruned. The cloud is
 * the long-term record; the local queue only needs enough history to debug a
 * recent problem.
 */
export function pruneSynced(
  sqlite: Database.Database,
  olderThanDays = 7,
  now: Date = new Date(),
): number {
  const cutoff = new Date(now.getTime() - olderThanDays * 86_400_000).toISOString();
  const result = sqlite
    .prepare("DELETE FROM sync_queue WHERE status = 'synced' AND synced_at < ?")
    .run(cutoff);
  return result.changes;
}
