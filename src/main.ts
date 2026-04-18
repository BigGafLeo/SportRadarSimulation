import 'reflect-metadata';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import type { AppConfig } from './shared/config/config.schema';
import { PROFILE_IDS } from './simulation/infrastructure/profiles/profile-registry';
import { SIMULATION_TOPICS } from './simulation/application/commands/simulation-topics';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useGlobalPipes(new ZodValidationPipe());
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableShutdownHooks();
  mountDashboardStatics(app);

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

function mountDashboardStatics(app: NestExpressApplication): void {
  // __dirname = dist/src when built, src when using ts-node. Try both.
  const candidates = [
    join(__dirname, '..', '..', 'public'),
    join(__dirname, '..', 'public'),
    join(process.cwd(), 'public'),
  ];
  const publicDir = candidates.find((p) => existsSync(p));
  if (!publicDir) return;
  app.useStaticAssets(publicDir, { prefix: '/dashboard' });
}

async function mountBullBoard(app: INestApplication): Promise<void> {
  const { createBullBoard } = await import('@bull-board/api');
  const { BullMQAdapter } = await import('@bull-board/api/bullMQAdapter');
  const { ExpressAdapter } = await import('@bull-board/express');
  const { Queue } = await import('bullmq');

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
