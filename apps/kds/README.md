# @pos/kds

Electron kitchen display — a dark, wall-mounted screen for the kitchen.

Phase-0 scaffold: boots the shell with a placeholder board and the shared `@pos/ui`
design tokens (dark KDS palette). The live board (New / In Progress / Ready, colour-coded
by wait time, bump/recall, allergen flags) arrives in **Phase 2** over a WebSocket feed
from the backend, with an offline fallback.

The KDS holds **no local database** — it is a projection of order state, never a source
of truth.

## Run

```bash
pnpm kds        # vite + electron on :5274
```
