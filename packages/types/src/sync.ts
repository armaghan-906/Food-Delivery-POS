/** Outbox row states. See ADR-004 — delivery is at-least-once. */
export type SyncStatus = 'pending' | 'in_flight' | 'synced' | 'failed';

/** Entities that travel upward (till -> cloud). */
export type SyncEntity = 'order_event' | 'payment' | 'stock_movement' | 'shift';

export interface SyncQueueItem {
  id: string;
  entity: SyncEntity;
  /** UUID of the record being synced — the cloud's idempotency key. */
  entityId: string;
  payload: string; // JSON
  status: SyncStatus;
  attempts: number;
  lastError: string | null;
  /** Exponential backoff target; worker skips rows until this passes. */
  nextAttemptAt: string | null;
  createdAt: string;
  syncedAt: string | null;
}

export interface SyncPushRequest {
  deviceId: string;
  locationId: string;
  items: Array<{
    entity: SyncEntity;
    entityId: string;
    payload: unknown;
  }>;
}

export interface SyncPushResponse {
  /** Accepted includes duplicates — resending is always safe (ADR-004). */
  accepted: string[];
  rejected: Array<{ entityId: string; reason: string }>;
}
