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

describe('HTTP restart flow', () => {
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

  it('restart after auto-finish → score reset, state RUNNING again', async () => {
    const token = await registerAndGetToken(app, 'restart-owner@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    const { simulationId } = created.body;

    await tickTo(clock, 10_000);
    await worker.drainInFlight();

    await request(app.getHttpServer())
      .post(`/simulations/${simulationId}/restart`)
      .set('Authorization', `Bearer ${token}`)
      .expect(202);

    const afterRestart = await request(app.getHttpServer())
      .get(`/simulations/${simulationId}`)
      .expect(200);
    expect(afterRestart.body.state).toBe('RUNNING');
    expect(afterRestart.body.totalGoals).toBe(0);

    await tickTo(clock, 10_000);
    await worker.drainInFlight();
    const afterSecond = await request(app.getHttpServer())
      .get(`/simulations/${simulationId}`)
      .expect(200);
    expect(afterSecond.body.state).toBe('FINISHED');
    expect(afterSecond.body.totalGoals).toBe(9);
  });

  it('restart when RUNNING → 409 INVALID_STATE', async () => {
    const token = await registerAndGetToken(app, 'restart-running@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    const { simulationId } = created.body;
    await tickTo(clock, 3000);
    await request(app.getHttpServer())
      .post(`/simulations/${simulationId}/restart`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);
  });
});
