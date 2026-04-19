import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';

async function tickTo(clock: FakeClock, totalMs: number): Promise<void> {
  for (let i = 0; i < totalMs; i += 1) await clock.advance(1);
}

async function registerAndGetToken(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'TestPass123!' })
    .expect(201);
  return res.body.accessToken;
}

describe('HTTP manual finish mid-simulation', () => {
  let app: INestApplication;
  let clock: FakeClock;
  let worker: SimulationWorkerHandler;

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
    clock = module.get(PORT_TOKENS.CLOCK) as FakeClock;
    worker = module.get(SimulationWorkerHandler);
  });

  afterEach(async () => {
    await app.close();
  });

  it('finish before 9s elapses → state FINISHED with reason=manual, fewer goals', async () => {
    const token = await registerAndGetToken(app, 'manual-finish@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    const { simulationId } = created.body;

    await tickTo(clock, 3000);
    await request(app.getHttpServer())
      .post(`/simulations/${simulationId}/finish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(202);
    await worker.drainInFlight();

    const final = await request(app.getHttpServer())
      .get(`/simulations/${simulationId}`)
      .expect(200);
    expect(final.body.state).toBe('FINISHED');
    expect(final.body.totalGoals).toBeLessThan(9);
  });

  it('finish without Bearer → 401 UNAUTHORIZED', async () => {
    const token = await registerAndGetToken(app, 'finish-noauth@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/simulations/${created.body.simulationId}/finish`)
      .expect(401);
  });

  it('finish with different user → 403 FORBIDDEN', async () => {
    const token1 = await registerAndGetToken(app, 'finish-owner@example.com');
    const token2 = await registerAndGetToken(app, 'finish-other@example.com');
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

  it('finish on unknown simulationId → 404 NOT_FOUND', async () => {
    const unknown = '550e8400-e29b-41d4-a716-111111111111';
    const token = await registerAndGetToken(app, 'finish-404@example.com');
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/simulations/${unknown}/finish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
