# Food-Delivery-POS

Offline-first, cloud-connected Point of Sale for a UK food delivery / restaurant chain.

The till keeps trading through an internet outage. The cloud is **synced to**, never
**depended on**.

![status](https://img.shields.io/badge/phase-1%20in%20progress-blue)
![license](https://img.shields.io/badge/license-UNLICENSED-lightgrey)
![node](https://img.shields.io/badge/node-%3E%3D20.11-brightgreen)

---

## Why this exists

A restaurant till that stops taking orders when the broadband drops is not a till. This
system treats the network as an optimisation, not a dependency:

- Every order writes to **local SQLite first**. The UI never awaits the network.
- Orders are an **append-only event log**, so two offline terminals can never produce a
  sync conflict — and you get a complete audit trail for free.
- Anything bound for the cloud also lands in a **sync queue** (outbox pattern) that drains
  automatically on reconnect.

## Tech stack

| Layer | Choice |
|---|---|
| Till app | Electron + React + TypeScript + Vite |
| UI | Tailwind CSS — touch-first, large tap targets |
| Local DB | SQLite via better-sqlite3 + Drizzle — source of truth for live operations |
| Cloud DB | MySQL 8 + Prisma — source of truth for everything, over time |
| Cloud API | NestJS (REST for sync, WebSocket for live updates) |
| State | Zustand |
| Monorepo | pnpm workspaces |

## Repository layout

```
apps/
  terminal/     Electron desktop till            ✅ scaffold running
  backend/      NestJS cloud API + sync          📋 planned
packages/
  types/        Shared types & domain vocabulary ✅
  local-db/     SQLite schema, migrations, outbox ✅
  core/         Order events, pricing, VAT       📋 next
  sync/         Outbox worker, push/pull         📋 planned
  hardware/     Printer / drawer / card terminal 📋 planned
docs/
  decisions.md  Architecture decision records
  compliance.md UK regulatory notes
```

## Getting started

**Prerequisites:** Node >= 20.11, pnpm >= 10

```bash
git clone https://github.com/armaghan-906/Food-Delivery-POS.git
cd Food-Delivery-POS
pnpm install          # also compiles native binaries for both Node and Electron
pnpm terminal         # launch the till
```

Other commands:

```bash
pnpm test             # run all package tests
pnpm typecheck        # strict TypeScript across the workspace
pnpm rebuild:native   # rebuild better-sqlite3 after a Node/Electron upgrade
```

> **Running inside VS Code?** VS Code's extension host exports
> `ELECTRON_RUN_AS_NODE=1`, which makes Electron boot as plain Node and fail with
> `Cannot read properties of undefined (reading 'whenReady')`. Launch with
> `env -u ELECTRON_RUN_AS_NODE pnpm terminal`, or use a normal terminal.

## Architecture principles

1. **Local-first.** Local SQLite is the source of truth for *now* in that restaurant. The
   central DB is the source of truth for *everything, everywhere, over time*.
2. **Append-only orders.** Orders are events (`ORDER_CREATED`, `ITEM_ADDED`,
   `PAYMENT_TAKEN`…), not mutable rows. Central replays them.
3. **Client-generated UUIDv4** on every record, so offline terminals never collide.
4. **At-least-once sync.** The cloud dedupes on the client UUID, so retries are always
   safe.
5. **Money is integer pence.** No floats anywhere in the money path — enforced by a test
   asserting no `REAL` columns exist.
6. **Hardware behind interfaces.** No vendor lock-in on printers, drawers or card
   terminals.
7. **Business logic is framework-free.** It lives in `packages/core`, independent of
   Electron, so the same engine can later drive a tablet app or kitchen display.

Full reasoning in [docs/decisions.md](docs/decisions.md).

## Guarantees enforced by the database

These are constraints and triggers, not conventions — a bug or a person with a SQL client
cannot violate them:

- **`order_events` is append-only.** `UPDATE` and `DELETE` raise an error. Trading history
  cannot be rewritten. This is what makes the log an HMRC-grade audit trail.
- **`(device_id, sequence)` is unique**, so a reset counter fails loudly instead of
  silently corrupting event replay order.
- **`(location_id, business_date, daily_number)` is unique** — one site cannot issue order
  `#42` twice in a trading day, but two sites can each have one.
- **`card_last4` must be exactly 4 characters**, so a full card number cannot be written
  there.

## UK compliance

Built in from day one, not retrofitted. See [docs/compliance.md](docs/compliance.md).

**Allergens (Natasha's Law).** All 14 statutory allergens are taggable on menu items *and*
modifiers — a modifier can introduce an allergen the base item lacks. "Contains" and "may
contain" are tracked as distinct claims.

**VAT / Making Tax Digital.** VAT is tracked per line item and resolved from the order
channel, because UK VAT on food depends on both the item and how it is consumed:

| | Eat in | Takeaway |
|---|---|---|
| Hot food | 20% | 20% |
| Cold food | 20% | **0%** |

The resolved rate is frozen onto the line at point of sale, so historical orders re-render
with the VAT actually charged.

**PCI-DSS.** No raw card data enters this system — not the database, not the logs, not
crash dumps. Card payments go through a certified provider terminal (Stripe Terminal or
Dojo) which returns a token only. Keeping the till out of the cardholder data environment
is what keeps this business on SAQ-B rather than a full SAQ-D audit.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Single till: order → cash payment → receipt, fully offline, syncs on reconnect | 🔨 in progress |
| 2 | ESC/POS receipt + kitchen printers, KDS, table management | 📋 |
| 3 | Card payments (Stripe Terminal / Dojo) incl. offline store-and-forward | 📋 |
| 4 | Deliveroo / Uber Eats / Just Eat integrations + own online ordering | 📋 |
| 5 | Multi-site admin dashboard, consolidated reporting, loyalty | 📋 |
| 6 | Accounting integration (Xero / QuickBooks / Sage) for MTD | 📋 |

### Phase 1 progress

- [x] pnpm monorepo + strict TypeScript
- [x] Electron shell + React UI running
- [x] Local SQLite schema, migrations, outbox queue
- [ ] Seed menu with categories, modifiers, allergens, VAT
- [ ] Event-sourced order engine (`packages/core`)
- [ ] Order screen — browse, modifiers, running VAT total
- [ ] Cash payment flow
- [ ] On-screen / printable receipt
- [ ] Sync engine skeleton + NestJS backend

## Contributing

- TypeScript strict mode everywhere.
- Pricing, tax and order logic must be small, pure and unit-tested.
- No business logic in Electron main/renderer glue — it belongs in shared packages.
- Small, PR-sized commits with meaningful messages.
- Every package carries a README describing its purpose and how to run it.

## Licence

UNLICENSED — private commercial project. All rights reserved.
