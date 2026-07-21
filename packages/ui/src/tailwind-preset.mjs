/**
 * Shared Tailwind preset. Apps spread this into their own config so every
 * surface draws from the same token set.
 *
 *   import posPreset from '@pos/ui/tailwind-preset';
 *   export default { presets: [posPreset], content: [...] };
 *
 * Values mirror src/tokens.ts — keep the two in sync.
 */
/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
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
        kds: {
          bg: '#0b1220',
          surface: '#111c2e',
          border: '#1e2c44',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'system-ui',
          'sans-serif',
        ],
      },
      minHeight: { touch: '64px' },
      minWidth: { touch: '64px' },
    },
  },
};
