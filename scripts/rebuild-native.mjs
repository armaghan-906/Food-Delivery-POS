#!/usr/bin/env node
/**
 * Build better-sqlite3 for BOTH Node and Electron, and cache each binary.
 *
 * better-sqlite3 uses V8 bindings rather than N-API, so its .node file is
 * compiled against one specific ABI. Electron and Node have different ones.
 * A single build therefore cannot serve both, and rebuilding for Electron
 * silently breaks `vitest` (which runs under Node) and vice versa.
 *
 * Rather than making developers rebuild whenever they switch between running
 * tests and running the app, we compile once for each ABI and stash the
 * results. `@pos/local-db` then selects the right one at runtime via
 * better-sqlite3's `nativeBinding` option.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, '.native');

function findModuleDir() {
  const base = path.join(root, 'node_modules', '.pnpm');
  const match = readdirSync(base).find((d) => d.startsWith('better-sqlite3@'));
  if (!match) throw new Error('better-sqlite3 not found in node_modules/.pnpm');
  return path.join(base, match, 'node_modules', 'better-sqlite3');
}

const moduleDir = findModuleDir();
const built = path.join(moduleDir, 'build', 'Release', 'better_sqlite3.node');

function stash(target) {
  if (!existsSync(built)) throw new Error(`Expected build output at ${built}`);
  const dest = path.join(cacheDir, target);
  mkdirSync(dest, { recursive: true });
  copyFileSync(built, path.join(dest, 'better_sqlite3.node'));
  console.log(`[native] cached ${target} binary`);
}

const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

// node-gyp directly, not `pnpm rebuild` — pnpm treats an existing build as
// satisfied and silently no-ops, which leaves the *other* ABI's binary in
// place and produces a baffling NODE_MODULE_VERSION error at test time.
console.log('[native] building better-sqlite3 for Node…');
execSync('npx --yes node-gyp rebuild --release', { cwd: moduleDir, stdio: 'inherit' });
stash('node');

console.log('[native] building better-sqlite3 for Electron…');
run(`npx electron-rebuild -f -w better-sqlite3 -m "${moduleDir}"`);
stash('electron');

console.log('[native] done — both ABIs cached in .native/');
