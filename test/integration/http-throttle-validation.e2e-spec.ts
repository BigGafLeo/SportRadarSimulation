import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';

describe('HTTP throttle + validation', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PORT_TOKENS.CLOCK)
      .useValue(new FakeClock(new Date('2026-04-18T12:00:00Z')))
      .overrideProvider(PORT_TOKENS.RANDOM_PROVIDER)
      .useValue(new SeededRandomProvider(42))
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('second start within 5s with same token → 429 THROTTLED', async () => {
    const first = await request(app.getHttpServer())
      .post('/simulations')
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/simulations')
      .set('x-simulation-token', first.body.ownershipToken)
      .send({ name: 'Paryz 2024' })
      .expect(429);
  });

  it('name shorter than 8 chars → 400 INVALID_VALUE', async () => {
    await request(app.getHttpServer()).post('/simulations').send({ name: 'Short' }).expect(400);
  });

  it('name with special characters → 400', async () => {
    await request(app.getHttpServer())
      .post('/simulations')
      .send({ name: 'Katar-2023' })
      .expect(400);
  });

  it('name longer than 30 → 400', async () => {
    await request(app.getHttpServer())
      .post('/simulations')
      .send({ name: 'A'.repeat(31) })
      .expect(400);
  });
});
