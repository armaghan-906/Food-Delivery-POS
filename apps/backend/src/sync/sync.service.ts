import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SyncPushRequest, SyncPushResponse } from '@pos/types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Upward-sync ingest.
 *
 * Delivery is at-least-once (ADR-004), so this must be idempotent: the till's
 * `entityId` is the cloud idempotency key. Recording it makes a re-delivered
 * item a no-op that still reports as accepted — resending is always safe.
 *
 * Phase 0 stores the receipt only. Projecting order events into the read-model
 * tables (OrderLine, Payment, …) by replay is Phase 1.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingest(request: SyncPushRequest): Promise<SyncPushResponse> {
    const accepted: string[] = [];
    const rejected: SyncPushResponse['rejected'] = [];

    for (const item of request.items) {
      try {
        await this.prisma.processedSyncItem.upsert({
          where: { entityId: item.entityId },
          update: {}, // duplicate re-delivery: accept, change nothing
          create: {
            entityId: item.entityId,
            entity: item.entity,
            deviceId: request.deviceId,
            locationId: request.locationId,
            payload: (item.payload ?? {}) as Prisma.InputJsonValue,
          },
        });
        accepted.push(item.entityId);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'unknown error';
        this.logger.error(`Rejected ${item.entityId}: ${reason}`);
        rejected.push({ entityId: item.entityId, reason });
      }
    }

    return { accepted, rejected };
  }
}
