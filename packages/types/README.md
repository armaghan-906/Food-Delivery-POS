# @pos/types

Shared TypeScript types and domain vocabulary. Zero runtime dependencies, no I/O.

Everything else in the monorepo depends on this package, so it must stay free of
framework, database, and platform concerns.

## Contents

| Module | Purpose |
|---|---|
| `money.ts` | `Pence` branded type, VAT rates as basis points, formatting |
| `allergens.ts` | The 14 statutory UK allergens, labels, contains/may-contain |
| `events.ts` | Order event types and their payloads (the append-only log) |
| `sync.ts` | Outbox queue shapes, push request/response contracts |

## Run

```bash
pnpm --filter @pos/types typecheck
```

## Notes

- `Pence` is a branded number. Build values with `pence()` or `poundsToPence()`;
  a raw `number` will not type-check into the money path.
- `ALLERGENS` is statutory. It is not configuration and must not be edited.
- `OrderEvent` payloads are keyed by event type, so `payload` narrows correctly
  when you switch on `type`.
