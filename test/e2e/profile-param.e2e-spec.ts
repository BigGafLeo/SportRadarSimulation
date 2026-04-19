import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

async function registerAndGetToken(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'TestPass123!' })
    .expect(201);
  return res.body.accessToken;
}

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
    const token = await registerAndGetToken(app, 'profile-default@example.com');
    const res = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Default Profile Test' })
      .expect(201);
    expect(res.body.simulationId).toBeDefined();
  });

  it('accepts each known profile', async () => {
    const profiles: Array<{ id: string; name: string; email: string }> = [
      {
        id: 'uniform-realtime',
        name: 'Uniform Profile Test',
        email: 'profile-uniform@example.com',
      },
      {
        id: 'poisson-accelerated',
        name: 'Poisson Profile Test',
        email: 'profile-poisson@example.com',
      },
      { id: 'fast-markov', name: 'Markov Profile Test', email: 'profile-markov@example.com' },
    ];
    for (const { id, name, email } of profiles) {
      const token = await registerAndGetToken(app, email);
      const res = await request(app.getHttpServer())
        .post('/simulations')
        .set('Authorization', `Bearer ${token}`)
        .send({ name, profile: id })
        .expect(201);
      expect(res.body.simulationId).toBeDefined();
    }
  });

  it('rejects unknown profile with 400', async () => {
    const token = await registerAndGetToken(app, 'profile-bad@example.com');
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bad Profile Test', profile: 'mystery-profile' })
      .expect(400);
  });
});
