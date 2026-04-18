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
  const { PORT_TOKENS } = await import('./simulation/domain/ports/tokens');
  const { BullMQCommandBus } = await import('./shared/messaging/bullmq-command-bus');
  const { BullMQEventBus } = await import('./shared/messaging/bullmq-event-bus');

  const commandBus = app.get(PORT_TOKENS.COMMAND_BUS);
  const eventBus = app.get(PORT_TOKENS.EVENT_BUS);
  const adapters: InstanceType<typeof BullMQAdapter>[] = [];

  if (commandBus instanceof BullMQCommandBus) {
    for (const [, queue] of commandBus.getQueues()) {
      adapters.push(new BullMQAdapter(queue));
    }
  }
  if (eventBus instanceof BullMQEventBus) {
    adapters.push(new BullMQAdapter(eventBus.getQueue()));
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/queues');
  createBullBoard({ queues: adapters, serverAdapter });

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.use('/queues', serverAdapter.getRouter());
}

void bootstrap();
