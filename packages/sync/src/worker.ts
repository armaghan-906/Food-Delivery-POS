import type Database from 'better-sqlite3';
import {
  claimBatch,
  markSynced,
  markFailed,
  markRejected,
  releaseStaleInFlight,
  queueStats,
  type QueueStats,
} from '@pos/local-db';
import { SyncTransportError, type SyncTransport } from './transport.js';

/**
 * The outbox worker: drains the sync queue when the network allows.
 *
 * Design rules:
 *
 *  - It NEVER blocks the UI. Everything here runs off the render path.
 *  - It NEVER discards a retryable item. A till offline for a day must still
 *    deliver everything afterwards; dropping a payment because the network was
 *    down would be losing money.
 *  - It is safe to resend. Delivery is at-least-once and the cloud dedupes on
 *    the client-generated UUID (ADR-004), so aggressive retries are correct.
 */

export interface WorkerOptions {
  sqlite: Database.Database;
  transport: SyncTransport;
  deviceId: string;
  locationId: string;
  /** Items per push. Small enough to fit a poor connection's timeout. */
  batchSize?: number;
  /** How often to attempt a drain. */
  intervalMs?: number;
  onTick?: (result: TickResult) => void;
}

export interface TickResult {
  attempted: number;
  synced: number;
  failed: number;
  rejected: number;
  skippedOffline: boolean;
  error?: string;
}

export class OutboxWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private draining = false;

  private readonly batchSize: number;
  private readonly intervalMs: number;

  constructor(private readonly options: WorkerOptions) {
    this.batchSize = options.batchSize ?? 50;
    this.intervalMs = options.intervalMs ?? 5_000;
  }

  /**
   * Start draining.
   *
   * Releases stale in_flight rows first: anything still in_flight means the
   * app died mid-send. We cannot know whether those arrived, so we resend and
   * let the cloud dedupe. The alternative — assuming they landed — risks
   * silently losing revenue records.
   */
  start(): void {
    if (this.timer) return;

    const released = releaseStaleInFlight(this.options.sqlite);
    if (released > 0) {
      console.log(`[sync] released ${released} stale in-flight items after restart`);
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);

    // Drain immediately rather than waiting a full interval.
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  stats(): QueueStats {
    return queueStats(this.options.sqlite);
  }

  /** One drain attempt. Public so tests can drive it deterministically. */
  async tick(): Promise<TickResult> {
    // Overlapping ticks would claim the same rows and waste bandwidth on the
    // connection that is usually the constraint.
    if (this.draining) {
      return { attempted: 0, synced: 0, failed: 0, rejected: 0, skippedOffline: false };
    }

    this.draining = true;
    try {
      return await this.drainOnce();
    } finally {
      this.draining = false;
    }
  }

  private async drainOnce(): Promise<TickResult> {
    const empty: TickResult = {
      attempted: 0,
      synced: 0,
      failed: 0,
      rejected: 0,
      skippedOffline: false,
    };

    const reachable = await this.options.transport.isReachable();
    if (!reachable) {
      // Not an error. Offline is a normal operating state for this system.
      return { ...empty, skippedOffline: true };
    }

    const batch = claimBatch(this.options.sqlite, this.batchSize);
    if (batch.length === 0) return empty;

    try {
      const response = await this.options.transport.push({
        deviceId: this.options.deviceId,
        locationId: this.options.locationId,
        items: batch.map((item) => ({
          entity: item.entity,
          entityId: item.entityId,
          payload: JSON.parse(item.payload) as unknown,
        })),
      });

      const byEntityId = new Map(batch.map((item) => [item.entityId, item.id]));

      // Accepted includes duplicates the cloud already had — resending is
      // always safe, so a duplicate is a success, not a failure.
      const syncedIds = response.accepted
        .map((entityId) => byEntityId.get(entityId))
        .filter((id): id is string => id !== undefined);

      const rejected = response.rejected
        .map((r) => {
          const id = byEntityId.get(r.entityId);
          return id ? { id, error: r.reason } : null;
        })
        .filter((r): r is { id: string; error: string } => r !== null);

      // Anything the server mentioned in neither list is unaccounted for.
      // Treat it as retryable — an ambiguous outcome must not be assumed
      // successful when it concerns money.
      const accountedFor = new Set([...syncedIds, ...rejected.map((r) => r.id)]);
      const unaccounted = batch
        .filter((item) => !accountedFor.has(item.id))
        .map((item) => ({ id: item.id, error: 'Server did not acknowledge this item' }));

      markSynced(this.options.sqlite, syncedIds);
      markRejected(this.options.sqlite, rejected);
      markFailed(this.options.sqlite, unaccounted);

      return {
        attempted: batch.length,
        synced: syncedIds.length,
        failed: unaccounted.length,
        rejected: rejected.length,
        skippedOffline: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const permanent = error instanceof SyncTransportError && !error.retryable;

      const failures = batch.map((item) => ({ id: item.id, error: message }));

      if (permanent) {
        // The server rejected the whole batch for a reason retrying cannot
        // fix. Park them for a human rather than jamming the queue.
        markRejected(this.options.sqlite, failures);
        return {
          attempted: batch.length,
          synced: 0,
          failed: 0,
          rejected: batch.length,
          skippedOffline: false,
          error: message,
        };
      }

      markFailed(this.options.sqlite, failures);
      return {
        attempted: batch.length,
        synced: 0,
        failed: batch.length,
        rejected: 0,
        skippedOffline: false,
        error: message,
      };
    }
  }
}
