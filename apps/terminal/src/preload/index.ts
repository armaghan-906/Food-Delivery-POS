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
};

contextBridge.exposeInMainWorld('pos', bridge);
