# @pos/terminal

The Electron till app — Electron + React + Vite + TypeScript + Tailwind.

## Run

```bash
pnpm --filter @pos/terminal dev     # or `pnpm terminal` from the repo root
```

Vite serves the renderer on `localhost:5273` and rebuilds main/preload on change.

## Process layout

```
src/
  main/       Electron main process — owns SQLite, the window, IPC handlers
  preload/    contextBridge script — the ONLY renderer→main route
  renderer/   React UI (no Node access whatsoever)
  shared/     The typed IPC contract, imported by all three
```

`src/shared/ipc-contract.ts` is the seam. It must stay free of Node and DOM
imports since all three processes import it.

## Security posture

Per ADR-005, the renderer is treated as untrusted:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- The preload exposes named passthroughs only — never `ipcRenderer` itself, and
  never a channel taken from an argument
- The IPC surface is domain-shaped (`db:status`), never generic (`db:query`).
  A generic query channel would hand the renderer arbitrary SQL and undo the
  isolation
- CSP is applied as a **response header** from main, not a meta tag, so dev can
  allow Vite's inline HMR scripts while production allows neither inline script
  nor any remote origin

## Build quirks worth knowing

These cost real time to rediscover, so they are written down:

**The package is `"type": "commonjs"`, deliberately.** Vite emits ESM for the
main bundle when the package is `"type": "module"`, and an ESM main entry that
loads a native CJS addon (better-sqlite3) trips Node's CJS pre-parser with an
opaque `Cannot read properties of undefined (reading 'exports')`. CJS output
sidesteps the interop entirely. Consequence: `tailwind.config.mjs` and
`postcss.config.mjs` need the `.mjs` extension to stay ESM.

**Paths in `vite.config.ts` must be absolute.** Vite's `root` is
`src/renderer`, so any relative path in the Electron plugin config resolves
against the renderer directory and silently fails to find the entry.

**`ELECTRON_RUN_AS_NODE` must not be set.** Some editors (VS Code's extension
host among them) export it. When set, Electron runs as plain Node,
`require('electron')` returns a path string instead of the API object, and you
get `Cannot read properties of undefined (reading 'whenReady')`. If you see
that, launch with:

```bash
env -u ELECTRON_RUN_AS_NODE pnpm dev
```

**Native module ABI.** better-sqlite3 is V8-ABI-bound, not N-API, so Node and
Electron need separately compiled binaries. `scripts/rebuild-native.mjs` (run on
postinstall) builds both into `.native/` and `@pos/local-db` picks the right one
at runtime. If you see a `NODE_MODULE_VERSION` mismatch, run
`pnpm rebuild:native`.

## Current state — Phase 1 scaffold

The screen renders "Hello POS" plus a live system-status panel proving the full
chain works: renderer → preload bridge → main → SQLite, with context isolation
on. The connectivity pill is informational only and never gates the UI — the
till trades identically online or offline.

Next: the order screen (menu browse, modifiers, running VAT total).
