import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('POST /simulations { profile } (in-memory transport)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts request without profile (defaults to uniform-realtime)', async () => {
    const res = await request(app.getHttpServer())
      .post('/simulations')
      .send({ name: 'Default Profile Test' })
      .expect(201);
    expect(res.body.simulationId).toBeDefined();
  });

  it('accepts each known profile', async () => {
    const profiles: Array<{ id: string; name: string }> = [
      { id: 'uniform-realtime', name: 'Uniform Profile Test' },
      { id: 'poisson-accelerated', name: 'Poisson Profile Test' },
      { id: 'fast-markov', name: 'Markov Profile Test' },
    ];
    for (const { id, name } of profiles) {
      const res = await request(app.getHttpServer())
        .post('/simulations')
        .send({ name, profile: id })
        .expect(201);
      expect(res.body.simulationId).toBeDefined();
    }
  });

  it('rejects unknown profile with 400', async () => {
    await request(app.getHttpServer())
      .post('/simulations')
      .send({ name: 'Bad Profile Test', profile: 'mystery-profile' })
      .expect(400);
  });
});
