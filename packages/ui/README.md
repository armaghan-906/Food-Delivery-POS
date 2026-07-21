# @pos/ui

Shared design tokens and (over time) React primitives for every POS surface —
till, KDS, dashboard, online ordering.

Tokens come from the Figma system (00-SYSTEM / Colour & Type) and are exposed two ways:

- **TypeScript** — `import { colors, fontFamily } from '@pos/ui'`
- **Tailwind preset** — `import posPreset from '@pos/ui/tailwind-preset'` then
  `{ presets: [posPreset] }` in an app's `tailwind.config.mjs`

Keep `src/tokens.ts` and `src/tailwind-preset.mjs` in sync — one is the runtime view,
the other the Tailwind view of the same values.

> Note: `apps/terminal` currently carries an inline copy of these tokens; it should adopt
> this preset in a follow-up so there is a single source of truth.
