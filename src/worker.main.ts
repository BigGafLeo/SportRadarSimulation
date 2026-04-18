import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerBootstrapModule } from './worker.bootstrap.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerBootstrapModule);
  app.enableShutdownHooks();
  // TODO(phase-6): replace with Pino logger.
  // eslint-disable-next-line no-console
  console.log('Worker started (APP_MODE=worker)');
}

void bootstrap();
