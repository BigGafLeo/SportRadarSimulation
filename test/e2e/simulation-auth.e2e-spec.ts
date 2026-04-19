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

describe('Simulation + Auth E2E', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PORT_TOKENS.CLOCK)
      .useValue(new FakeClock(new Date('2026-04-19T12:00:00Z')))
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

  it('start simulation with valid Bearer → 201', async () => {
    const token = await registerAndGetToken(app, 'user1@example.com');
    const res = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    expect(res.body.simulationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.state).toBe('RUNNING');
  });

  it('start simulation without Bearer → 401', async () => {
    await request(app.getHttpServer())
      .post('/simulations')
      .send({ name: 'Katar 2023' })
      .expect(401);
  });

  it('finish own simulation → 202', async () => {
    const token = await registerAndGetToken(app, 'owner@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/simulations/${created.body.simulationId}/finish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(202);
  });

  it("finish someone else's simulation → 403", async () => {
    const token1 = await registerAndGetToken(app, 'owner1@example.com');
    const token2 = await registerAndGetToken(app, 'other@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/simulations/${created.body.simulationId}/finish`)
      .set('Authorization', `Bearer ${token2}`)
      .expect(403);
  });

  it('finish without Bearer → 401', async () => {
    const token = await registerAndGetToken(app, 'finisher@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/simulations/${created.body.simulationId}/finish`)
      .expect(401);
  });

  it('GET /simulations (no auth) → 200', async () => {
    await request(app.getHttpServer()).get('/simulations').expect(200);
  });

  it('GET /simulations/:id (no auth) → 200', async () => {
    const token = await registerAndGetToken(app, 'reader@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer()).get(`/simulations/${created.body.simulationId}`).expect(200);
  });

  it('same user starts two sims within cooldown → 429', async () => {
    const token = await registerAndGetToken(app, 'throttle@example.com');
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

  it('two different users start simultaneously → both 201', async () => {
    const token1 = await registerAndGetToken(app, 'userA@example.com');
    const token2 = await registerAndGetToken(app, 'userB@example.com');
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token2}`)
      .send({ name: 'Paryz 2024' })
      .expect(201);
  });
});
