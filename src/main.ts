import 'reflect-metadata';
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
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  // TODO(phase-6): replace with Pino logger.
  // eslint-disable-next-line no-console
  console.log(`Application is running on port ${port}`);
}

void bootstrap();
