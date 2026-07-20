# UK compliance notes

Hooks built in from day one. None of this is legal advice — validate with your accountant
and, for allergens, your EHO.

## Allergens — Natasha's Law / FIC Regulations

The 14 regulated allergens are a fixed statutory list (see `packages/types`):

celery, cereals containing gluten, crustaceans, eggs, fish, lupin, milk, molluscs, mustard,
nuts (tree nuts), peanuts, sesame, soybeans, sulphur dioxide/sulphites.

**Data model.** Allergens attach to both `menu_items` and `modifiers` — a modifier can
introduce an allergen the base item doesn't have (adding cheese to a vegan burger). The
effective allergen set for a line is the union of item + selected modifiers, and this is
computed in `packages/core` so it is unit-testable.

**Point of order.** Staff-facing warning is Phase 1. Customer-facing display is Phase 4
(online ordering), where the legal exposure is higher because there is no staff member in
the loop.

**"May contain".** Tracked as a distinct flag from "contains". Conflating precautionary
labelling with declared ingredients is the failure mode that gets people hurt.

## Making Tax Digital (HMRC)

**Requirement.** VAT records kept digitally, with a digital audit trail from source record
to VAT return — no manual re-keying or copy-paste between systems.

**How the model serves this.**

- VAT is tracked **per line item**, not per order, so mixed-rate baskets (the norm in food)
  are decomposable.
- The resolved VAT rate is frozen onto the line at time of sale — the record reflects what
  was actually charged.
- The order event log is append-only and immutable, giving a complete audit trail: what was
  ordered, voided, discounted, refunded, by which staff member, when, on which device.
- Corrections are new events, never edits. There is no code path that mutates a historical
  order.

**Retention.** VAT records must be kept for 6 years. The cloud DB is the system of record
for this; till-local data is prunable after successful sync.

**Export (Phase 6).** Xero/QuickBooks/Sage. The data shape is already right; that phase is
adapters, not remodelling.

## PCI-DSS

**Absolute rule: no raw card data enters this system.** Not the database, not application
logs, not error reports, not crash dumps, not analytics.

Card payments go through a provider terminal/SDK (Stripe Terminal or Dojo, Phase 3) which
handles the card in its own certified environment and returns a token plus a display-safe
summary.

**What we are permitted to store** on a `payments` row:

- provider reference / transaction ID
- last 4 digits
- card scheme (Visa, Mastercard…)
- auth code
- amount, currency, status, timestamp

**What must never appear anywhere:** full PAN, CVV/CVC (never storable at all, even
encrypted, even by certified processors), magnetic stripe or chip track data, PIN or PIN
block.

Keeping the terminal out of the cardholder data environment is what keeps this business on
SAQ-B/P2PE rather than a full SAQ-D audit. That is a large, recurring cost difference and
it is worth defending in code review.

**Phase 3 risk to decide, not default.** Offline card store-and-forward means accepting a
payment that cannot be authorised at the time. Declines surface later and the loss lands on
the merchant. This needs an explicit floor limit and a business owner, not a technical
default.
