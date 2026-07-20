# @pos/local-db

The till's local SQLite database — schema, migrations, and the outbox queue.

This is the **source of truth for live operations**. The till trades from here whether or
not the internet exists. Cloud sync is a downstream consumer, never a dependency.

## Run

```bash
pnpm --filter @pos/local-db test        # migrations + append-only guarantees
pnpm --filter @pos/local-db typecheck
```

## Usage

```ts
import { initialiseDatabase } from '@pos/local-db';

const { db, sqlite } = initialiseDatabase({ path: '/path/to/till.sqlite' });
// migrations are applied automatically, in order, each in its own transaction
```

Call this once in the Electron **main** process. The renderer never touches it
directly — see ADR-005.

## Schema map

| Area | Tables |
|---|---|
| Reference (pulled from central) | `locations` `categories` `menu_items` `modifier_groups` `modifiers` `menu_item_modifier_groups` `allergen_tags` `staff` |
| Cash drawer | `shifts` `cash_movements` |
| Orders | `order_events` (truth) · `orders` `order_lines` (projections) · `payments` |
| Sync | `sync_queue` (outbox) `device_state` |
| Inventory | `inventory_items` `stock_movements` |

## Guarantees enforced by the database itself

These are not conventions — they are constraints and triggers, so a bug or a person with a
SQL client cannot violate them:

- **`order_events` is append-only.** `UPDATE` and `DELETE` triggers `RAISE(ABORT)`. History
  cannot be rewritten. This is what makes the log an HMRC-grade audit trail.
- **`(device_id, sequence)` is unique** on events, so a reset sequence counter fails loudly
  rather than silently corrupting replay order.
- **`(location_id, business_date, daily_number)` is unique** on orders — one site cannot
  issue `#42` twice in a trading day, but two sites can both have one.
- **`card_last4` must be exactly 4 characters**, so a full PAN cannot be written there.
- **No `REAL` columns exist**, enforced by a test. Money is integer pence everywhere.

## Durability

The pragmas in `client.ts` assume a till gets unplugged mid-service, because it does:

- `journal_mode = WAL` — the sync worker's writes never block the order screen.
- `synchronous = FULL` — `NORMAL` can lose committed transactions on power loss. For money
  that isn't an acceptable trade, and one till's write volume makes the fsync cost
  irrelevant.
- `foreign_keys = ON` — SQLite defaults this *off*, which surprises people.

## Migrations

Hand-rolled (`migrate.ts`) rather than drizzle-kit's runner, because migrations ship inside
a packaged Electron app and run unattended against real trading data. They must be embedded
in the bundle, not loaded from disk.

Rules: append only, never renumber, never edit an applied migration. Each runs in its own
transaction, so a failure at #3 leaves #1 and #2 applied and reports exactly where it
stopped.
