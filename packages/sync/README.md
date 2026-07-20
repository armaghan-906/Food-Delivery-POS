# @pos/sync

The sync engine: outbox worker that drains local writes to the cloud.

## Run

```bash
pnpm --filter @pos/sync test        # 18 tests
pnpm --filter @pos/sync typecheck
```

## How it works

Every local write bound for the cloud is enqueued in `sync_queue` **in the same
transaction as the write itself** (`@pos/local-db` `enqueue`). That is the whole point of
the outbox pattern: if the order event committed, its queue row committed too. Nothing can
be saved locally and silently never reach the cloud.

The worker then drains that queue on an interval.

## Rules it follows

**It never blocks the UI.** Everything runs off the render path. The till takes orders at
the same speed whether sync is healthy, slow, or entirely offline.

**Offline is a normal state, not an error.** When unreachable, a tick returns
`skippedOffline` and consumes nothing — no attempt counter incremented, no backoff applied.

**It never discards a retryable item.** Failures return to `pending`, never to a terminal
state. A till offline for a day must still deliver everything afterwards; dropping a
payment because the network was down is losing money.

**Ambiguity is treated as failure.** If the server acknowledges neither acceptance nor
rejection of an item, it is retried. An unclear outcome must not be assumed successful when
it concerns revenue.

**Duplicates are success.** Delivery is at-least-once and the cloud dedupes on the
client-generated UUID (ADR-004), so a duplicate acknowledgement marks the item synced.

**Crash recovery resends.** Anything left `in_flight` at startup means the app died
mid-send. We cannot know whether it arrived, so we resend and let the cloud dedupe.

**Overlapping ticks are prevented.** Two concurrent drains would claim the same rows and
waste bandwidth on the connection that is usually the constraint.

## Backoff

Exponential — 2s, 4s, 8s — **capped at 5 minutes**. The cap matters: uncapped, a till
offline overnight would schedule its next attempt days into the future and fail to drain
promptly when the connection returned.

## Retryable vs permanent

| Response | Treatment |
|---|---|
| Network error, timeout | Retry forever |
| 408, 429, 5xx | Retry forever |
| 400, 401, 403, 404, 422 | Park as `failed` for a human |

Getting this split wrong is costly in both directions: retry a permanent failure and the
queue jams behind it; drop a retryable one and revenue data is gone.

Rejected items are kept in the table, never deleted — a rejected revenue record is
something a person needs to see.

## Usage

```ts
const worker = new OutboxWorker({
  sqlite, transport, deviceId, locationId,
});
worker.start();          // drains immediately, then every 5s
worker.stats();          // queue health for the UI
worker.stop();
```

`SyncTransport` is an interface, so the worker is fully testable without a server and
swapping REST for WebSocket later touches only the implementation.
