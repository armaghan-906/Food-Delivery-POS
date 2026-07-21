/**
 * Design tokens — the single source of truth for the product's visual language,
 * lifted from the Figma system (00-SYSTEM / Colour & Type).
 *
 * Consumed two ways: as TypeScript constants (for inline styles / canvas / KDS)
 * and via the Tailwind preset in `./tailwind-preset.mjs`, which mirrors these
 * values into `theme.extend`. Keep the two in sync.
 */

export const colors = {
  brand: {
    50: '#e6f4f4',
    100: '#d0eaea',
    500: '#0d7377',
    600: '#0b6265',
    700: '#095a5c',
  },
  ink: '#1e293b',
  subtle: '#64748b',
  faint: '#94a3b8',
  line: '#e2e8f0',
  canvas: '#f4f7f6',
  /** KDS runs a dark, wall-mounted theme (see apps/kds). */
  kds: {
    bg: '#0b1220',
    surface: '#111c2e',
    border: '#1e2c44',
  },
  status: {
    ok: '#22c55e',
    warn: '#f59e0b',
    danger: '#ef4444',
  },
} as const;

export const fontFamily = {
  sans: [
    'Inter',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'system-ui',
    'sans-serif',
  ],
} as const;

/** Touch-target floor for till/KDS controls: 44px is a11y minimum, 64px works on a busy till. */
export const touchTarget = '64px';
