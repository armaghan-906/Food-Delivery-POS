import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';

// Bundled to CJS (see vite.config.ts) — __dirname comes from the module wrapper.
declare const __dirname: string;

let mainWindow: BrowserWindow | null = null;

/**
 * KDS is a wall-mounted, always-on screen. Phase 0 boots a dark placeholder
 * board; the live feed (WebSocket from the backend, with an offline fallback)
 * lands in Phase 2. No local database — the KDS is a projection, not a source
 * of truth.
 */
function applyContentSecurityPolicy(): void {
  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
  const policy = devServerUrl
    ? [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline' ${devServerUrl}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        `connect-src 'self' ${devServerUrl} ws://localhost:5274`,
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "frame-src 'none'",
      ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [policy] },
    });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#0b1220',
    show: false,
    title: 'Kitchen Display',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const devServerUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

void app.whenReady().then(() => {
  applyContentSecurityPolicy();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
