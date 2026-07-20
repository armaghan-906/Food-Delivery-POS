import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Vite's `root` is src/renderer, so every other path must be absolute or it
// would resolve relative to the renderer directory.
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
              // better-sqlite3 is a native module — it must stay external and
              // be loaded by Node at runtime, not bundled.
              external: ['electron', 'better-sqlite3'],
              // CJS, not ESM. Electron 33 supports ESM main, but a native CJS
              // addon imported from an ESM entry trips Node's CJS pre-parser.
              // CJS output sidesteps the interop entirely.
              output: { format: 'cjs', entryFileNames: 'index.cjs' },
            },
          },
        },
      },
      preload: {
        input: abs('src/preload/index.ts'),
        vite: {
          build: {
            outDir: abs('dist-electron/preload'),
            rollupOptions: {
              external: ['electron'],
              // Sandboxed preload scripts cannot use ESM — must be CJS.
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
  server: { port: 5273, strictPort: true },
});
