import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import {
  initialiseDatabase,
  enqueue,
  queueStats,
  backoffMs,
  claimBatch,
  releaseStaleInFlight,
} from '@pos/local-db';
import type { SyncPushRequest, SyncPushResponse } from '@pos/types';
import { OutboxWorker } from '../worker.js';
import { SyncTransportError, type SyncTransport, isRetryableStatus } from '../transport.js';

/** Scriptable fake so tests never touch a network. */
class FakeTransport implements SyncTransport {
  reachable = true;
  pushes: SyncPushRequest[] = [];
  /** Override to control the response or throw. */
  handler: (req: SyncPushRequest) => Promise<SyncPushResponse> = async (req) => ({
    accepted: req.items.map((i) => i.entityId),
    rejected: [],
  });

  async push(request: SyncPushRequest): Promise<SyncPushResponse> {
    this.pushes.push(request);
    return this.handler(request);
  }

  async isReachable(): Promise<boolean> {
    return this.reachable;
  }
}

let sqlite: Database.Database;
let transport: FakeTransport;
let worker: OutboxWorker;

beforeEach(() => {
  ({ sqlite } = initialiseDatabase({ path: ':memory:' }));
  transport = new FakeTransport();
  worker = new OutboxWorker({
    sqlite,
    transport,
    deviceId: 'dev-1',
    locationId: 'loc-1',
    batchSize: 10,
  });
});

function enqueueEvents(count: number): void {
  for (let i = 0; i < count; i++) {
    enqueue(sqlite, {
      entity: 'order_event',
      entityId: `evt-${i}`,
      payload: { type: 'ITEM_ADDED', index: i },
    });
  }
}

describe('draining', () => {
  it('does nothing when the queue is empty', async () => {
    const result = await worker.tick();
    expect(result.attempted).toBe(0);
    expect(transport.pushes).toHaveLength(0);
  });

  it('pushes pending items and marks them synced', async () => {
    enqueueEvents(3);
    const result = await worker.tick();

    expect(result.attempted).toBe(3);
    expect(result.synced).toBe(3);
    expect(queueStats(sqlite).pending).toBe(0);
    expect(queueStats(sqlite).synced).toBe(3);
  });

  it('respects the batch size', async () => {
    enqueueEvents(25);
    await worker.tick();

    expect(transport.pushes[0]?.items).toHaveLength(10);
    expect(queueStats(sqlite).pending).toBe(15);
  });

  it('sends device and location context', async () => {
    enqueueEvents(1);
    await worker.tick();
    expect(transport.pushes[0]?.deviceId).toBe('dev-1');
    expect(transport.pushes[0]?.locationId).toBe('loc-1');
  });
});

describe('offline behaviour', () => {
  it('skips quietly when unreachable — offline is not an error', async () => {
    enqueueEvents(3);
    transport.reachable = false;

    const result = await worker.tick();

    expect(result.skippedOffline).toBe(true);
    expect(transport.pushes).toHaveLength(0);
    // Nothing consumed, nothing penalised.
    expect(queueStats(sqlite).pending).toBe(3);
  });

  it('drains everything queued while offline once back online', async () => {
    // The core offline-first promise.
    transport.reachable = false;
    enqueueEvents(12);
    await worker.tick();
    expect(queueStats(sqlite).pending).toBe(12);

    transport.reachable = true;
    await worker.tick();
    await worker.tick();

    expect(queueStats(sqlite).pending).toBe(0);
    expect(queueStats(sqlite).synced).toBe(12);
  });
});

describe('failure handling', () => {
  it('returns items to pending on a retryable failure — never drops them', async () => {
    enqueueEvents(3);
    transport.handler = async () => {
      throw new SyncTransportError('503 Service Unavailable', true, 503);
    };

    const result = await worker.tick();

    expect(result.failed).toBe(3);
    // Back to pending, not lost, not terminal.
    expect(queueStats(sqlite).pending).toBe(3);
    expect(queueStats(sqlite).failed).toBe(0);
  });

  it('eventually delivers after transient failures', async () => {
    enqueueEvents(2);
    let attempt = 0;
    transport.handler = async (req) => {
      attempt += 1;
      if (attempt === 1) throw new SyncTransportError('network down', true);
      return { accepted: req.items.map((i) => i.entityId), rejected: [] };
    };

    await worker.tick();
    expect(queueStats(sqlite).pending).toBe(2);

    // Backoff has been applied, so claim with a future clock.
    const later = new Date(Date.now() + 60_000);
    const claimed = claimBatch(sqlite, 10, later);
    expect(claimed).toHaveLength(2);
  });

  it('parks a permanently rejected batch instead of jamming the queue', async () => {
    enqueueEvents(2);
    transport.handler = async () => {
      throw new SyncTransportError('400 Bad Request', false, 400);
    };

    const result = await worker.tick();

    expect(result.rejected).toBe(2);
    expect(queueStats(sqlite).failed).toBe(2);
    expect(queueStats(sqlite).pending).toBe(0);
  });

  it('handles a partially accepted batch', async () => {
    enqueueEvents(3);
    transport.handler = async (req) => ({
      accepted: [req.items[0]!.entityId, req.items[1]!.entityId],
      rejected: [{ entityId: req.items[2]!.entityId, reason: 'Malformed payload' }],
    });

    const result = await worker.tick();

    expect(result.synced).toBe(2);
    expect(result.rejected).toBe(1);
    expect(queueStats(sqlite).synced).toBe(2);
    expect(queueStats(sqlite).failed).toBe(1);
  });

  it('retries items the server silently ignored', async () => {
    // An ambiguous outcome must never be assumed successful when it is money.
    enqueueEvents(3);
    transport.handler = async (req) => ({
      accepted: [req.items[0]!.entityId],
      rejected: [],
      // items 1 and 2 unmentioned
    });

    const result = await worker.tick();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(2);
    expect(queueStats(sqlite).pending).toBe(2);
  });
});

describe('idempotency', () => {
  it('treats a duplicate acknowledgement as success', async () => {
    // The cloud dedupes and reports already-seen items as accepted (ADR-004).
    enqueueEvents(2);
    transport.handler = async (req) => ({
      accepted: req.items.map((i) => i.entityId),
      rejected: [],
    });

    await worker.tick();
    expect(queueStats(sqlite).synced).toBe(2);
  });

  it('resends in-flight items after a crash', async () => {
    // Anything left in_flight means the app died mid-send. We cannot know if
    // it arrived, so resend — the cloud dedupes.
    enqueueEvents(3);
    claimBatch(sqlite, 10); // simulate a send that never completed
    expect(queueStats(sqlite).inFlight).toBe(3);

    const released = releaseStaleInFlight(sqlite);
    expect(released).toBe(3);
    expect(queueStats(sqlite).pending).toBe(3);
  });
});

describe('concurrency', () => {
  it('does not send the same item twice on overlapping ticks', async () => {
    enqueueEvents(5);

    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    transport.handler = async (req) => {
      await gate;
      return { accepted: req.items.map((i) => i.entityId), rejected: [] };
    };

    const first = worker.tick();
    const second = await worker.tick(); // should no-op while first is in flight
    release();
    await first;

    expect(second.attempted).toBe(0);
    expect(transport.pushes).toHaveLength(1);
  });
});

describe('backoff', () => {
  it('grows exponentially', () => {
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(3)).toBe(8000);
  });

  it('caps at 5 minutes so a long outage still drains promptly', () => {
    // Uncapped, a till offline overnight would schedule its next attempt days out.
    expect(backoffMs(20)).toBe(300_000);
    expect(backoffMs(100)).toBe(300_000);
  });
});

describe('retryable status classification', () => {
  it('retries timeouts, rate limits and server errors', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableStatus(status), `${status} should retry`).toBe(true);
    }
  });

  it('does not retry client errors that will never succeed', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryableStatus(status), `${status} should not retry`).toBe(false);
    }
  });
});
