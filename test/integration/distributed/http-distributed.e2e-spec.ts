import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { AppModule } from '../../../src/app.module';

jest.setTimeout(120_000);

describe('Distributed HTTP flow (BullMQ + Redis via Testcontainers)', () => {
  let container: StartedTestContainer;
  let app: INestApplication;

  let accessToken: string;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const redisUrl = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
    process.env.TRANSPORT_MODE = 'bullmq';
    process.env.PERSISTENCE_MODE = 'memory';
    process.env.REDIS_URL = redisUrl;
    process.env.BULL_BOARD_ENABLED = 'false';
    process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-chars-long!!';

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();

    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'distributed@test.com', password: 'Password123!' })
      .expect(201);
    accessToken = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
    await container.stop();
    delete process.env.TRANSPORT_MODE;
    delete process.env.PERSISTENCE_MODE;
    delete process.env.REDIS_URL;
    delete process.env.BULL_BOARD_ENABLED;
    delete process.env.JWT_SECRET;
  });

  it('full flow over BullMQ: POST → 9 goals → auto-finish (real engine timing)', async () => {
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Distributed MVP' })
      .expect(201);
    const simId = created.body.simulationId;

    // Real-time timing — wait ~11s for 9 goals + finish event to propagate
    await new Promise((resolve) => setTimeout(resolve, 11_000));

    const final = await request(app.getHttpServer())
      .get(`/simulations/${simId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(final.body.state).toBe('FINISHED');
    expect(final.body.totalGoals).toBe(9);
  });
});
