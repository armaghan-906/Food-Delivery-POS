# Architecture decisions

Short records of choices that are expensive to reverse.

---

## ADR-001: Money is integer pence

**Decision.** Every monetary value in every layer — SQLite, MySQL, TypeScript, JSON on the
wire — is a signed integer in pence. There are no floats and no decimal strings in the
money path.

**Why.** `0.1 + 0.2 !== 0.3`. A till that rounds differently from the cloud produces
Z-reports that don't reconcile, which is both an accounting problem and an HMRC problem.
Integers make the arithmetic exact and the rounding decision explicit and testable.

**Consequence.** Rounding happens in exactly one place (`packages/core`), at a defined
point in the calculation, using a documented mode (half-up). Display formatting is a
presentation concern and never feeds back into stored values.

---

## ADR-002: VAT rate is a function of item *and* channel

**Decision.** `menu_items` carries `vat_rate_eat_in` and `vat_rate_takeaway`. The
effective rate is resolved per line item at the time the item is added, from the order's
channel, and the resolved rate is **frozen onto the line**.

**Why.** UK VAT on food is not a property of the product:

| | Eat in | Takeaway |
|---|---|---|
| Hot food | 20% | 20% |
| Cold food | 20% | 0% |

A single `vat_rate` column produces legally incorrect receipts for any business doing both
dine-in and takeaway — which is this business. Freezing the resolved rate onto the line
means a historical order re-renders with the VAT that was actually charged, not whatever
the menu says today.

**Consequence.** Changing an order's channel after items are added must re-resolve VAT.
That is a domain operation with an event (`ORDER_CHANNEL_CHANGED`), not a field update.

---

## ADR-003: Event ordering does not trust the till clock

**Decision.** `order_events` carries a per-device monotonic `sequence` alongside
`created_at`. Replay orders by `(device_id, sequence)`. The cloud additionally stamps
`received_at` on arrival.

**Why.** Till clocks drift, and staff change system time. Wall-clock alone means a clock
adjustment can reorder or silently drop events during replay, corrupting the order.

**Consequence.** The sequence counter is per-device and persisted, so it survives restart.

---

## ADR-004: Sync is at-least-once; the cloud must be idempotent

**Decision.** Every synced record carries its client-generated UUID as an idempotency key.
The backend enforces a unique constraint and treats a duplicate insert as success.

**Why.** An outbox worker that dies between "HTTP 200 received" and "mark row synced" will
resend on restart. This is not an edge case, it is the normal failure mode of an unreliable
connection. Without a dedupe key, a flaky link silently double-counts revenue.

**Consequence.** Retries are always safe. The worker can be aggressive about resending.

---

## ADR-005: SQLite lives in the Electron main process

**Decision.** `better-sqlite3` and Drizzle run in the main process. The renderer reaches
them only through a narrow, typed IPC contract exposed by a preload script.
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.

**Why.** Two reasons. Security: a renderer with Node access turns any XSS in the UI into
full filesystem access on a machine that handles payments. Portability: the UI talks to an
interface, not to Electron, so the same React app can later be backed by HTTP for a tablet
or KDS without a rewrite.

**Consequence.** All DB access is async from the renderer's point of view even though
better-sqlite3 is synchronous. The IPC surface is deliberately small and domain-shaped
(`orders.addItem`), not generic (`db.query`).

---

## ADR-006: State management is Zustand

**Decision.** Zustand for renderer state.

**Why.** The durable state lives in SQLite. The store is a thin session/view layer — current
order, selected category, logged-in staff. Redux Toolkit's reducer/action ceremony is
overhead for that, and its main advantage (time-travel over a normalised store) is already
provided by the event log itself.

---

## ADR-007: Human-readable order numbers are separate from IDs

**Decision.** Orders have a UUIDv4 primary key **and** a `daily_number` — a per-site,
per-trading-day sequence starting at 1.

**Why.** Kitchen staff cannot call out a UUID. Every real service needs a short number, and
it needs to reset daily and be unique per site, so it cannot double as the distributed ID.

**Consequence.** Allocation is a local SQLite transaction; it never blocks on the network.
Two sites will both have order `#42` on the same day, which is correct — the pair
`(location_id, business_date, daily_number)` is the unique key.
