import { Controller, Get } from '@nestjs/common';

/**
 * Liveness probe. The till's sync transport calls this before draining its
 * outbox (see @pos/sync HttpSyncTransport.isReachable), so it must stay cheap
 * and dependency-free — no DB round-trip.
 */
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  @Get()
  check(): { status: 'ok'; uptimeS: number } {
    return { status: 'ok', uptimeS: Math.round((Date.now() - this.startedAt) / 1000) };
  }
}
