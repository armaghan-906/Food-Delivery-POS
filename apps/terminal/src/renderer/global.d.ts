import type { PosBridge } from '../shared/ipc-contract.js';

declare global {
  interface Window {
    /** Exposed by the preload script. The renderer's only route to main. */
    readonly pos: PosBridge;
  }
}

declare module '*.png' {
  const src: string;
  export default src;
}

export {};
