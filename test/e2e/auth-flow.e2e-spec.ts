import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Auth flow E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('registers and returns accessToken + user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'new@example.com', password: 'StrongPass1!' })
        .expect(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.user.email).toBe('new@example.com');
      expect(res.body.user.createdAt).toBeDefined();
    });

    it('rejects duplicate email with 409', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'dup@example.com', password: 'StrongPass1!' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'dup@example.com', password: 'AnotherPass!' })
        .expect(409);
    });

    it('rejects invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'StrongPass1!' })
        .expect(400);
    });

    it('rejects short password with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'short@example.com', password: 'Ab1!' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'login@example.com', password: 'CorrectPass!' });
    });

    it('returns accessToken on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'login@example.com', password: 'CorrectPass!' })
        .expect(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe('login@example.com');
    });

    it('rejects wrong email with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'wrong@example.com', password: 'CorrectPass!' })
        .expect(401);
    });

    it('rejects wrong password with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'login@example.com', password: 'WrongPass!' })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it('returns user data with valid Bearer token', async () => {
      const reg = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'me@example.com', password: 'MyPass123!' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${reg.body.accessToken}`)
        .expect(200);
      expect(res.body.id).toBe(reg.body.user.id);
      expect(res.body.email).toBe('me@example.com');
    });

    it('rejects request without token with 401', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('rejects malformed token with 401', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
    });
  });
});
