import type { SyncPushRequest, SyncPushResponse } from '@pos/types';

/**
 * Typed client for the NestJS backend, used by the admin dashboard and the
 * online-ordering app. The till does NOT use this — it talks to the cloud only
 * through the outbox transport in `@pos/sync`, which is the one write path that
 * survives being offline.
 *
 * This is a Phase-0 skeleton: it establishes the shape (auth header, JSON,
 * typed errors) and the endpoints that already exist server-side. New endpoints
 * are added here as their backend modules land.
 */

export interface ApiClientOptions {
  baseUrl: string;
  /** JWT bearer for dashboard/ordering sessions. Set after login. */
  getToken?: () => string | null;
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface HealthResponse {
  status: 'ok';
  uptimeS: number;
}

export class ApiClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: ApiClientOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('GET', '/health');
  }

  /** Upward sync entry point — shares the exact contract the till pushes. */
  syncPush(request: SyncPushRequest): Promise<SyncPushResponse> {
    return this.request<SyncPushResponse>('POST', '/sync/push', request);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this.options.getToken?.() ?? null;
    const response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new ApiError(`${method} ${path} failed (${response.status})`, response.status, payload);
    }
    return payload as T;
  }
}
