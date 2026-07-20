# @pos/backend

NestJS cloud API. Receives order events from tills, replays them into PostgreSQL 16 via
Prisma, and serves reference data downward.

**Status:** not yet implemented — Phase 1 sync skeleton is next.

## Responsibilities

**Upward (till → cloud).** Accept batches of order events, payments, stock movements and
shifts from the outbox. Persist the raw event, then project it into reporting tables.

**Downward (cloud → till).** Serve menu, prices, modifiers, allergens, tax rules and staff.
Central wins on conflict, resolved by `updated_at` (last-write-wins).

## Non-negotiable: ingest must be idempotent

The till's outbox delivers **at least once** — a worker that dies between receiving HTTP
200 and marking the row synced will resend on restart. See ADR-004.

Every incoming record carries its client-generated UUID. Enforce a unique constraint on it
and treat a duplicate as success:

```sql
INSERT INTO order_events (id, ...) VALUES ($1, ...)
ON CONFLICT (id) DO NOTHING;
```

Without this, an unreliable connection silently double-counts revenue. This is the single
most important property of the whole service.

## Why PostgreSQL (see ADR-008)

- **JSONB + GIN** for event payloads, so payload queries are index-backed
- **Partial indexes** on the ingest table — index only unprocessed rows
- **Transactional DDL** — a failed migration rolls back the schema too
- **Range partitioning** of the event log by month, making retention a metadata operation

## Design notes for implementation

- Stamp `received_at` server-side on arrival. Never trust till wall-clock for ordering —
  replay by `(device_id, sequence)`. See ADR-003.
- Money arrives and is stored as integer pence. No `NUMERIC`, no `FLOAT`. See ADR-001.
- Devices authenticate with a registered `device_id` + token. An unauthenticated sync
  endpoint is an open revenue-write hole.
- The event log is append-only here too. Corrections are new events.
- **Never log request bodies wholesale.** Payment payloads pass through this service, and
  a debug log of a full request body is exactly how card data ends up somewhere it must
  never be. See docs/compliance.md.

## Local development (planned)

```bash
docker compose up -d postgres    # Postgres 16
pnpm --filter @pos/backend prisma migrate dev
pnpm --filter @pos/backend dev
```
