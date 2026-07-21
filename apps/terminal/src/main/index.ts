import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import {
  initialiseDatabase,
  currentVersion,
  seedDatabase,
  seedTables,
  SEED_STAFF,
  listActiveStaff,
  getStaffAuth,
  verifyPin,
  listTables,
  setTableStatus,
  getOpenShift,
  openShift,
  closeShift,
  SEED_LOCATION,
  type ShiftRow,
  type PosDatabase,
} from '@pos/local-db';
import { randomUUID } from 'node:crypto';
import {
  INITIAL_LOCKOUT,
  isLockedOut,
  secondsRemaining,
  recordFailure,
  recordSuccess,
  attemptsRemaining,
  can,
  type LockoutState,
  type Permission,
} from '@pos/core';
import type Database from 'better-sqlite3';
import { IPC } from '../shared/ipc-contract.js';
import type {
  ClockDirection,
  DbStatus,
  OverridePermission,
  OverrideResult,
  ShiftInfo,
  StaffSummary,
  TableInfo,
  TableStatus,
  VerifyPinResult,
} from '../shared/ipc-contract.js';

const DEVICE_ID = 'till-01';
const toShiftInfo = (s: ShiftRow): ShiftInfo => ({
  id: s.id,
  businessDate: s.businessDate,
  openingFloatP: s.openingFloatP,
  status: s.status,
  countedCashP: s.countedCashP,
  expectedCashP: s.expectedCashP,
  varianceP: s.varianceP,
  openedAt: s.openedAt,
  closedAt: s.closedAt,
});

/**
 * PIN-attempt lockout, held in memory per staff id. In-memory is deliberate for
 * now: a lockout that resets on app restart is acceptable, and it keeps the
 * throttle off the sync path. Persisting it is a later hardening step.
 */
const lockouts = new Map<string, LockoutState>();

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

async function openDb(): Promise<void> {
  const dbPath = databasePath();
  const result = initialiseDatabase({ path: dbPath });
  db = result.db;
  sqlite = result.sqlite;

  if (result.applied.length > 0) {
    console.log(`[db] applied migrations: ${result.applied.join(', ')}`);
  }
  console.log(`[db] ready at ${dbPath} (schema v${currentVersion(result.sqlite)})`);

  // Dev only. In production, menu and staff arrive by downward sync from
  // central and this never runs.
  if (!app.isPackaged) {
    const seed = await seedDatabase(result.sqlite);
    if (seed.skipped) {
      console.log('[seed] menu already present — skipped');
    } else {
      console.log(
        `[seed] ${seed.categories} categories, ${seed.items} items, ` +
          `${seed.modifiers} modifiers, ${seed.allergenTags} allergen tags`,
      );
      console.log('[seed] dev logins (development build only):');
      for (const member of SEED_STAFF) {
        console.log(`         ${member.pin}  ${member.name} (${member.role})`);
      }
    }

    // Floor-plan tables seed independently (idempotent), so databases seeded
    // before the floor plan existed still get their tables.
    const tables = seedTables(result.sqlite);
    if (!tables.skipped) console.log(`[seed] ${tables.tables} dining tables`);
  }
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

  ipcMain.handle(IPC.AUTH_LIST_STAFF, (): StaffSummary[] => {
    if (!sqlite) return [];
    return listActiveStaff(sqlite);
  });

  ipcMain.handle(
    IPC.AUTH_VERIFY_PIN,
    async (_event, staffId: string, pin: string): Promise<VerifyPinResult> => {
      const now = new Date();
      const state = lockouts.get(staffId) ?? INITIAL_LOCKOUT;

      // Locked accounts short-circuit — never even hash the PIN.
      if (isLockedOut(state, now)) {
        return { ok: false, lockedOut: true, secondsRemaining: secondsRemaining(state, now) };
      }

      const row = sqlite ? getStaffAuth(sqlite, staffId) : undefined;
      // Unknown staff is treated exactly like a wrong PIN — same shape, same
      // attempt cost — so the screen can't be used to enumerate valid ids.
      const valid = row ? await verifyPin(pin, row.pinHash) : false;

      if (!valid) {
        const next = recordFailure(state, now);
        lockouts.set(staffId, next);
        return isLockedOut(next, now)
          ? { ok: false, lockedOut: true, secondsRemaining: secondsRemaining(next, now) }
          : { ok: false, lockedOut: false, attemptsRemaining: attemptsRemaining(next) };
      }

      lockouts.set(staffId, recordSuccess());
      return { ok: true, staff: { id: row!.id, name: row!.name, role: row!.role } };
    },
  );

  ipcMain.handle(
    IPC.CLOCK_PUNCH,
    (_event, staffId: string, direction: ClockDirection): { ok: true } => {
      // Functional today as an audited log line; persistent clock entries land
      // with the shift / cash-up work (screen 1.12).
      console.log(`[clock] ${staffId} clocked ${direction} at ${new Date().toISOString()}`);
      return { ok: true };
    },
  );

  ipcMain.handle(
    IPC.AUTH_AUTHORIZE_OVERRIDE,
    async (_event, permission: OverridePermission, pin: string): Promise<OverrideResult> => {
      if (!sqlite) return { ok: false };
      // Check the PIN against every staff member who holds the permission. The
      // first authorised match wins; a wrong PIN or an unauthorised staff fails.
      for (const summary of listActiveStaff(sqlite)) {
        if (!can(summary.role, permission as Permission)) continue;
        const row = getStaffAuth(sqlite, summary.id);
        if (row && (await verifyPin(pin, row.pinHash))) {
          return { ok: true, staff: { id: row.id, name: row.name, role: row.role } };
        }
      }
      return { ok: false };
    },
  );

  ipcMain.handle(IPC.TABLES_LIST, (): TableInfo[] => {
    return sqlite ? (listTables(sqlite) as TableInfo[]) : [];
  });

  ipcMain.handle(
    IPC.TABLE_SET_STATUS,
    (_event, tableId: string, status: TableStatus): TableInfo | null => {
      if (!sqlite) return null;
      return (setTableStatus(sqlite, tableId, status, new Date().toISOString()) as TableInfo) ?? null;
    },
  );

  ipcMain.handle(IPC.SHIFT_GET_OR_OPEN, (_event, openingFloatP: number): ShiftInfo | null => {
    if (!sqlite) return null;
    let shift = getOpenShift(sqlite, DEVICE_ID);
    if (!shift) {
      shift = openShift(sqlite, {
        id: randomUUID(),
        locationId: SEED_LOCATION.id,
        deviceId: DEVICE_ID,
        businessDate: new Date().toISOString().slice(0, 10),
        openedByStaffId: 'shift-opener',
        openingFloatP,
        now: new Date().toISOString(),
      });
    }
    return toShiftInfo(shift);
  });

  ipcMain.handle(
    IPC.SHIFT_CLOSE,
    (_event, shiftId: string, countedCashP: number, expectedCashP: number): ShiftInfo | null => {
      if (!sqlite) return null;
      const row = closeShift(sqlite, {
        shiftId,
        closedByStaffId: 'shift-closer',
        countedCashP,
        expectedCashP,
        now: new Date().toISOString(),
      });
      return row ? toShiftInfo(row) : null;
    },
  );
}

void app.whenReady().then(async () => {
  await openDb();
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
