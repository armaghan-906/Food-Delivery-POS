import { Body, Controller, Post } from '@nestjs/common';
import type { SyncPushRequest, SyncPushResponse } from '@pos/types';
import { SyncService } from './sync.service';

/**
 * The endpoint the till's outbox drains to (@pos/sync HttpSyncTransport → POST
 * /sync/push). Contract is the shared SyncPushRequest/Response from @pos/types,
 * so client and server can never drift.
 */
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  push(@Body() body: SyncPushRequest): Promise<SyncPushResponse> {
    return this.sync.ingest(body);
  }
}
