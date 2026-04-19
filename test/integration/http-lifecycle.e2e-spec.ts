import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';

jest.setTimeout(15000);

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

describe('HTTP lifecycle — start → 9 goals → auto-finish', () => {
  let app: INestApplication;
  let module: TestingModule;
  let clock: FakeClock;
  let worker: SimulationWorkerHandler;

  beforeEach(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] })
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

  it('POST /simulations creates running simulation with 201', async () => {
    const token = await registerAndGetToken(app, 'lifecycle1@example.com');
    const response = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);

    expect(response.body.simulationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.state).toBe('RUNNING');
    expect(response.body.initialSnapshot.totalGoals).toBe(0);
  });

  it('full flow: start → 9 goals elapse → auto-finish, totalGoals=9 state=FINISHED', async () => {
    const token = await registerAndGetToken(app, 'lifecycle2@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    const simId = created.body.simulationId;

    await tickTo(clock, 10_000);
    await worker.drainInFlight();

    const finalState = await request(app.getHttpServer()).get(`/simulations/${simId}`).expect(200);
    expect(finalState.body.state).toBe('FINISHED');
    expect(finalState.body.totalGoals).toBe(9);
    expect(finalState.body.finishedAt).not.toBeNull();
  });

  it('GET /simulations lists created simulations', async () => {
    const token = await registerAndGetToken(app, 'lifecycle3@example.com');
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    const list = await request(app.getHttpServer()).get('/simulations').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].state).toBe('RUNNING');
  });
});
