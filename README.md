# pos-system

Offline-first, cloud-connected Point of Sale for a UK food delivery / restaurant chain.

The till keeps trading through an internet outage. The cloud is **synced to**, never
**depended on**.

## Layout

```
apps/
  terminal/     Electron + React + Vite desktop till
  backend/      NestJS cloud API + sync endpoints (Phase 1: skeleton)
packages/
  types/        Shared TypeScript types + domain enums
  local-db/     SQLite schema, migrations, sync queue (Drizzle + better-sqlite3)
  core/         Pure business logic: order events, pricing, VAT
  sync/         Outbox worker, push/pull engine
  hardware/     Printer / cash drawer / card terminal abstraction
```

## Prerequisites

- Node >= 20.11
- pnpm >= 10

## Getting started

```bash
pnpm install
pnpm terminal      # launches the Electron till in dev mode
```

## Key architectural rules

1. **Local-first.** Every write hits local SQLite first. The UI never awaits the network.
2. **Append-only orders.** Orders are an event log, not mutable rows. Central replays them.
3. **Client-generated UUIDv4** for every record, so two offline tills never collide.
4. **Outbox pattern.** Anything bound for the cloud is also written to `sync_queue`.
5. **Money is integer pence.** No floats anywhere in the money path.
6. **No raw card data.** Ever. Not in the DB, not in logs. See `docs/compliance.md`.

## Docs

- [Architecture decisions](docs/decisions.md)
- [UK compliance notes](docs/compliance.md)
