/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Touch targets sized for a busy service with wet or gloved hands.
      // 44px is the accessibility floor; 64px is what actually works on a till.
      minHeight: { touch: '64px' },
      minWidth: { touch: '64px' },
    },
  },
  plugins: [],
};
