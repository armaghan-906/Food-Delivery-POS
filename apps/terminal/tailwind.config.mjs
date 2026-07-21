/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Design tokens lifted from the Figma system (00-SYSTEM / Colour & Type).
      colors: {
        // Teal is the product's primary action colour.
        brand: {
          50: '#e6f4f4',
          100: '#d0eaea',
          500: '#0d7377',
          600: '#0b6265',
          700: '#095a5c',
        },
        // Slate ink for text; the till reads at arm's length so contrast matters.
        ink: '#1e293b',
        subtle: '#64748b',
        faint: '#94a3b8',
        line: '#e2e8f0',
        // App canvas is a soft off-white, cards are pure white.
        canvas: '#f4f7f6',
      },
      fontFamily: {
        // Inter if the OS has it, otherwise the platform UI face (SF on macOS).
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
      // Touch targets sized for a busy service with wet or gloved hands.
      // 44px is the accessibility floor; 64px is what actually works on a till.
      minHeight: { touch: '64px' },
      minWidth: { touch: '64px' },
    },
  },
  plugins: [],
};
