import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [PrismaModule, HealthModule, SyncModule],
})
export class AppModule {}
