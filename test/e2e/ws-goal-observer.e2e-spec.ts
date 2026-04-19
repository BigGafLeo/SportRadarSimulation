import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
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

describe('E2E WebSocket — observer receives goal events', () => {
  let app: INestApplication;
  let clock: FakeClock;
  let worker: SimulationWorkerHandler;
  let wsUrl: string;

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
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    wsUrl = `http://127.0.0.1:${address.port}/simulations`;
    clock = module.get(PORT_TOKENS.CLOCK) as FakeClock;
    worker = module.get(SimulationWorkerHandler);
  });

  afterEach(async () => {
    await app.close();
  });

  it('subscribes to simulation and receives 9 goal-scored events + simulation-finished', async () => {
    const token = await registerAndGetToken(app, 'ws-observer@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    const simId = created.body.simulationId;

    const socket: Socket = io(wsUrl, { transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    const goals: Array<{ totalGoals: number }> = [];
    const finishes: Array<{ reason: string }> = [];
    socket.on('goal-scored', (payload: { totalGoals: number }) => goals.push(payload));
    socket.on('simulation-finished', (payload: { reason: string }) => finishes.push(payload));

    await new Promise<void>((resolve, reject) => {
      socket.emit('subscribe', { simulationId: simId }, (ack: unknown) => {
        if ((ack as { ok?: boolean }).ok) resolve();
        else reject(new Error('subscribe nack'));
      });
    });

    await tickTo(clock, 10_000);
    await worker.drainInFlight();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    expect(goals).toHaveLength(9);
    expect(finishes).toHaveLength(1);
    expect(finishes[0].reason).toBe('auto');
    socket.disconnect();
  }, 10_000);
});
