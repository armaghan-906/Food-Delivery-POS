import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { initialiseDatabase, currentVersion, type PosDatabase } from '@pos/local-db';
import type Database from 'better-sqlite3';
import { IPC } from '../shared/ipc-contract.js';
import type { DbStatus } from '../shared/ipc-contract.js';

// This file is bundled to CJS (see vite.config.ts), so __dirname is provided
// by the module wrapper — do not switch to import.meta.url here.
declare const __dirname: string;

let mainWindow: BrowserWindow | null = null;
let db: PosDatabase | null = null;
let sqlite: Database.Database | null = null;

/**
 * The till database lives in Electron's userData dir, which survives app
 * updates. Never inside the app bundle — that gets replaced on upgrade and
 * would take the trading data with it.
 */
function databasePath(): string {
  return path.join(app.getPath('userData'), 'till.sqlite');
}

function openDb(): void {
  const dbPath = databasePath();
  const result = initialiseDatabase({ path: dbPath });
  db = result.db;
  sqlite = result.sqlite;

  if (result.applied.length > 0) {
    console.log(`[db] applied migrations: ${result.applied.join(', ')}`);
  }
  console.log(`[db] ready at ${dbPath} (schema v${currentVersion(result.sqlite)})`);
}

/**
 * CSP as a response header rather than a meta tag, so dev and production can
 * differ. Vite's HMR injects inline scripts and needs a websocket; production
 * must allow neither.
 */
function applyContentSecurityPolicy(): void {
  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];

  const policy = devServerUrl
    ? [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' ${devServerUrl}`,
        "style-src 'self' 'unsafe-inline'",
        'img-src \'self\' data:',
        `connect-src 'self' ${devServerUrl} ws://localhost:5273`,
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'", // Tailwind's injected styles
        "img-src 'self' data:",
        // A packaged till talks to the sync API over IPC via main, never
        // directly from the renderer. No remote origins belong here.
        "connect-src 'self'",
        "object-src 'none'",
        "frame-src 'none'",
      ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#0f172a',
    show: false,
    title: 'POS Terminal',
    webPreferences: {
      // Non-negotiable. A renderer with Node access turns any XSS in the UI
      // into filesystem access on a machine that handles payments. ADR-005.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload/index.cjs'),
    },
  });

  // Avoid the white flash before React paints — jarring on a dark till UI.
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Surface renderer console output in the terminal. Without this, a CSP
  // violation or a React mount failure is completely silent to whoever is
  // running `pnpm dev`.
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const tag = ['verbose', 'info', 'warning', 'error'][level] ?? 'info';
    console.log(`[renderer:${tag}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer] process gone: ${details.reason}`);
  });

  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * IPC surface. Deliberately domain-shaped (`db.status`) rather than generic
 * (`db.query`) — exposing arbitrary SQL to the renderer would defeat the point
 * of context isolation.
 */
function registerIpcHandlers(): void {
  ipcMain.handle(IPC.DB_STATUS, (): DbStatus => {
    if (!sqlite || !db) {
      return { ready: false, schemaVersion: 0, path: null, tableCount: 0 };
    }
    const row = sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .get() as { n: number };

    return {
      ready: true,
      schemaVersion: currentVersion(sqlite),
      path: databasePath(),
      tableCount: row.n,
    };
  });

  ipcMain.handle(IPC.APP_INFO, () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
  }));
}

void app.whenReady().then(() => {
  openDb();
  applyContentSecurityPolicy();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Close SQLite cleanly so WAL is checkpointed rather than left for recovery.
app.on('before-quit', () => {
  sqlite?.close();
  sqlite = null;
  db = null;
});
