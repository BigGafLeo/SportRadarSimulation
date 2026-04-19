import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import type { AppConfig } from './shared/config/config.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ZodValidationPipe());
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableShutdownHooks();

  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const transportMode = config.get('TRANSPORT_MODE', { infer: true });
  const bullBoardEnabled = config.get('BULL_BOARD_ENABLED', { infer: true });

  if (transportMode === 'bullmq' && bullBoardEnabled) {
    await mountBullBoard(app);
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  // TODO(phase-6): replace with Pino logger.
  // eslint-disable-next-line no-console
  console.log(`Application is running on port ${port} (transport: ${transportMode})`);
}

async function mountBullBoard(app: INestApplication): Promise<void> {
  const { createBullBoard } = await import('@bull-board/api');
  const { BullMQAdapter } = await import('@bull-board/api/bullMQAdapter');
  const { ExpressAdapter } = await import('@bull-board/express');
  const { Queue } = await import('bullmq');
  const { PROFILE_IDS } = await import('@simulation/infrastructure/profiles/profile-registry');
  const { SIMULATION_TOPICS } = await import('@simulation/application/commands/simulation-topics');

  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const redisUrl = config.get('REDIS_URL', { infer: true });
  const parsed = new URL(redisUrl);
  const connection = { host: parsed.hostname, port: Number(parsed.port || 6379) };

  // Per-profile run topics + shared abort/events. Bull Board reads stats via
  // Redis (not object identity), so registering the names up-front makes all
  // queues visible the moment UI opens — even before traffic flows.
  const queueNames = [
    ...PROFILE_IDS.map((id) => SIMULATION_TOPICS.RUN(id)),
    SIMULATION_TOPICS.ABORT,
    'simulation.events',
  ];
  const queues = queueNames.map((name) => new Queue(name, { connection }));
  const adapters = queues.map((q) => new BullMQAdapter(q));

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/queues');
  createBullBoard({ queues: adapters, serverAdapter });

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.use('/queues', serverAdapter.getRouter());
}

void bootstrap();
