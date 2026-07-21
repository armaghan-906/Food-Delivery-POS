import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-contract.js';
import type { PosBridge } from '../shared/ipc-contract.js';

/**
 * The only bridge between renderer and main.
 *
 * Every method is an explicit, named passthrough. Never expose `ipcRenderer`
 * itself, and never a channel taken from an argument — either would let the
 * renderer invoke any handler in main.
 */
const bridge: PosBridge = {
  getDbStatus: () => ipcRenderer.invoke(IPC.DB_STATUS),
  getAppInfo: () => ipcRenderer.invoke(IPC.APP_INFO),
  listStaff: () => ipcRenderer.invoke(IPC.AUTH_LIST_STAFF),
  verifyPin: (staffId, pin) => ipcRenderer.invoke(IPC.AUTH_VERIFY_PIN, staffId, pin),
  punchClock: (staffId, direction) => ipcRenderer.invoke(IPC.CLOCK_PUNCH, staffId, direction),
  listTables: () => ipcRenderer.invoke(IPC.TABLES_LIST),
  setTableStatus: (tableId, status) => ipcRenderer.invoke(IPC.TABLE_SET_STATUS, tableId, status),
  authorizeOverride: (permission, pin) =>
    ipcRenderer.invoke(IPC.AUTH_AUTHORIZE_OVERRIDE, permission, pin),
  getOrOpenShift: (openingFloatP) => ipcRenderer.invoke(IPC.SHIFT_GET_OR_OPEN, openingFloatP),
  closeShift: (shiftId, countedCashP, expectedCashP) =>
    ipcRenderer.invoke(IPC.SHIFT_CLOSE, shiftId, countedCashP, expectedCashP),
};

contextBridge.exposeInMainWorld('pos', bridge);
