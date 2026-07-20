import type { SyncPushRequest, SyncPushResponse } from '@pos/types';

/**
 * The network boundary, behind an interface.
 *
 * Everything above this is testable without a server, and swapping REST for
 * WebSocket later touches only the implementation.
 */
export interface SyncTransport {
  push(request: SyncPushRequest): Promise<SyncPushResponse>;
  /** Cheap connectivity probe. Must not throw. */
  isReachable(): Promise<boolean>;
}

/**
 * Errors the worker must treat differently.
 *
 * The distinction that matters: RETRYABLE means the payload was fine and the
 * network or server was not, so try again forever. PERMANENT means retrying
 * will never help, so stop and surface it to a human. Getting this wrong in
 * either direction is costly — retry a permanent failure and the queue jams
 * behind it; drop a retryable one and revenue data is lost.
 */
export class SyncTransportError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'SyncTransportError';
  }
}

/** HTTP status → retryable. */
export function isRetryableStatus(status: number): boolean {
  // 408 timeout, 429 rate limited, and all 5xx are the server's problem.
  if (status === 408 || status === 429) return true;
  if (status >= 500) return true;
  // Other 4xx mean we sent something wrong; sending it again will not help.
  return false;
}

export interface HttpTransportOptions {
  baseUrl: string;
  deviceId: string;
  locationId: string;
  /** Device token. Never a staff PIN, never a card credential. */
  authToken: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** REST implementation. Phase 1 uses this; WebSocket comes later. */
export class HttpSyncTransport implements SyncTransport {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: HttpTransportOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  async push(request: SyncPushRequest): Promise<SyncPushResponse> {
    const response = await this.request('/sync/push', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new SyncTransportError(
        `Push failed with ${response.status}`,
        isRetryableStatus(response.status),
        response.status,
      );
    }

    return (await response.json()) as SyncPushResponse;
  }

  async isReachable(): Promise<boolean> {
    try {
      const response = await this.request('/health', { method: 'GET' });
      return response.ok;
    } catch {
      // A probe must never throw — an offline till is a normal state, not an
      // error condition.
      return false;
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.authToken}`,
          'x-device-id': this.options.deviceId,
          'x-location-id': this.options.locationId,
          ...init.headers,
        },
      });
    } catch (error) {
      // Network-level failure: DNS, refused, timeout. Always retryable.
      throw new SyncTransportError(
        error instanceof Error ? error.message : 'Network error',
        true,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
