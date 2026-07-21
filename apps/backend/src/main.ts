import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Cloud API entry point. Phase 0 boots the app with health + the sync ingest
 * endpoint the till already pushes to; admin REST and the live WebSocket gateway
 * arrive in later phases.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  Logger.log(`POS backend listening on :${port}`, 'Bootstrap');
}

void bootstrap();
