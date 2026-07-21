import posPreset from '@pos/ui/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [posPreset],
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
};
