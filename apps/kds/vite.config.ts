import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const abs = (p: string) => path.join(appRoot, p);

export default defineConfig({
  root: abs('src/renderer'),
  plugins: [
    react(),
    electron({
      main: {
        entry: abs('src/main/index.ts'),
        vite: {
          build: {
            outDir: abs('dist-electron/main'),
            rollupOptions: {
              external: ['electron'],
              output: { format: 'cjs', entryFileNames: 'index.cjs' },
            },
          },
        },
      },
    }),
  ],
  build: {
    outDir: abs('dist-electron/renderer'),
    emptyOutDir: true,
  },
  // A separate port from the till (5273) so both can run in dev at once.
  server: { port: 5274, strictPort: true },
});
