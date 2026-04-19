import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';

async function registerAndGetToken(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'TestPass123!' })
    .expect(201);
  return res.body.accessToken;
}

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

  it('second start within 5s with same user → 429 THROTTLED', async () => {
    const token = await registerAndGetToken(app, 'throttle-user@example.com');
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Paryz 2024' })
      .expect(429);
  });

  it('name shorter than 8 chars → 400 INVALID_VALUE', async () => {
    const token = await registerAndGetToken(app, 'validation1@example.com');
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Short' })
      .expect(400);
  });

  it('name with special characters → 400', async () => {
    const token = await registerAndGetToken(app, 'validation2@example.com');
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar-2023' })
      .expect(400);
  });

  it('name longer than 30 → 400', async () => {
    const token = await registerAndGetToken(app, 'validation3@example.com');
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A'.repeat(31) })
      .expect(400);
  });
});
