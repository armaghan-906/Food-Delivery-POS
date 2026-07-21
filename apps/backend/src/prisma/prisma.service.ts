import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper so Nest owns the client's lifecycle (connect on boot, disconnect
 * on shutdown). The generated client comes from `prisma generate`, run before
 * typecheck/build (see package.json pretypecheck/prebuild hooks).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
