# @pos/core

The business logic engine: order events, pricing, VAT and allergens.

**Pure functions only.** No I/O, no clock, no randomness, no framework, no Electron. That
is what lets the till and the cloud independently replay the same event log and reach
byte-identical conclusions — and what will let this same engine drive a tablet app or a
kitchen display later without a rewrite.

## Run

```bash
pnpm --filter @pos/core test        # 65 tests
pnpm --filter @pos/core typecheck
```

## Modules

| Module | Purpose |
|---|---|
| `money.ts` | The single rounding function; multiply, sum, percentage |
| `vat.ts` | Channel-aware rate resolution, VAT extraction, rate-grouped summary |
| `allergens.ts` | Union of item + modifier allergens, customer conflict checks |
| `order/state.ts` | The shape an order folds into |
| `order/reducer.ts` | `applyEvent` / `replay` — the event fold |
| `order/totals.ts` | Line and order totals, discounts, change due |

## The rules this package encodes

**Menu prices are VAT-inclusive.** £8.99 is what the customer pays; VAT is *extracted*,
never added on top. UK consumer law requires displayed prices to include VAT.

**VAT depends on item *and* channel** (ADR-002). Consequence of that plus gross pricing:
the same item at the same price yields different VAT eat-in vs takeaway, so margin varies
by channel. That is correct — the customer pays the advertised price either way.

**VAT is derived by subtraction.** `net = gross × 10000 / (10000 + rate)`, then
`vat = gross − net`. Computing both independently can leave them a penny apart, which
means a receipt that does not add up. There is a test asserting `net + vat === gross`
across 5,000 values.

**Rounding is half-away-from-zero**, not `Math.round`. `Math.round(-2.5)` is `-2`, which
would round a refund differently from the sale it reverses. A refund must be the exact
negative of its sale, and there is a test for that.

**Discounts are apportioned across lines before VAT.** This is the subtle one. A
whole-order discount must be spread pro rata *before* VAT is worked out, because lines sit
at different rates — applying it to the order total instead would silently shift value
between the 20% and 0% buckets and misstate the VAT owed. The last line absorbs the
rounding remainder so the parts sum exactly to the discount.

**VAT summaries sum per-line, not in aggregate.** Summing gross and extracting once differs
by up to a penny from extracting per line and summing. The latter keeps printed lines
adding up to the printed summary.

**Voided lines are flagged, never removed.** A void is evidence, especially after payment.

**Allergen merges upgrade, never downgrade.** If the item says "may contain milk" and a
modifier says "contains milk", the result is "contains". That direction of error is the
one that matters.

**Unknown event types are ignored, not fatal.** An older till must not crash mid-service
replaying a log containing events from a newer version. You cannot update every terminal in
an estate at once.

## Replay is deterministic

`replay()` sorts by `sequence`, never by `createdAt` — till clocks drift and staff change
them (ADR-003). Tests assert that shuffled and reversed event logs produce identical state,
which is what makes sync over a flaky connection safe.

## Open question for Phase 2

**Service charge VAT treatment.** Currently added after goods and excluded from the VAT
breakdown. A genuinely discretionary service charge is outside the scope of VAT; a
mandatory one is standard-rated. This needs a business decision before table service ships,
and the model should probably carry an `isDiscretionary` flag rather than assume.
