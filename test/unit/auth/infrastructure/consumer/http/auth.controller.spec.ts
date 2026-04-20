import { AuthController } from '@auth/infrastructure/consumer/http/auth.controller';
import { RegisterUseCase } from '@auth/application/use-cases/register.use-case';
import { LoginUseCase } from '@auth/application/use-cases/login.use-case';
import { InMemoryUserRepository } from '@auth/infrastructure/persistence/in-memory-user.repository';
import { FakePasswordHasher } from '@auth/infrastructure/security/fake-password-hasher';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let repo: InMemoryUserRepository;
  let hasher: FakePasswordHasher;
  let jwtService: JwtService;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    hasher = new FakePasswordHasher();
    jwtService = new JwtService({ secret: 'test-secret-minimum-32-chars-long!!' });
    const registerUseCase = new RegisterUseCase(repo, hasher);
    const loginUseCase = new LoginUseCase(repo, hasher);
    controller = new AuthController(registerUseCase, loginUseCase, jwtService, repo);
  });

  describe('POST /auth/register', () => {
    it('returns 201 with accessToken and user', async () => {
      const result = await controller.register({
        email: 'new@example.com',
        password: 'StrongPass1!',
      });
      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe('new@example.com');
      expect(result.user.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.user.createdAt).toBeDefined();
    });

    it('response contains createdAt as ISO string (not Date object)', async () => {
      const result = await controller.register({
        email: 'isodate@example.com',
        password: 'StrongPass1!',
      });
      expect(typeof result.user.createdAt).toBe('string');
      expect(new Date(result.user.createdAt).toISOString()).toBe(result.user.createdAt);
    });

    it('response contains accessToken as string', async () => {
      const result = await controller.register({
        email: 'token@example.com',
        password: 'StrongPass1!',
      });
      expect(typeof result.accessToken).toBe('string');
      expect(result.accessToken.length).toBeGreaterThan(0);
    });

    it('throws ConflictException on duplicate email', async () => {
      await controller.register({ email: 'dup@example.com', password: 'StrongPass1!' });
      await expect(
        controller.register({ email: 'dup@example.com', password: 'AnotherPass!' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await controller.register({ email: 'user@example.com', password: 'CorrectPass!' });
    });

    it('returns 200 with accessToken and user', async () => {
      const result = await controller.login({
        email: 'user@example.com',
        password: 'CorrectPass!',
      });
      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe('user@example.com');
    });

    it('response contains createdAt as ISO string (not Date object)', async () => {
      const result = await controller.login({
        email: 'user@example.com',
        password: 'CorrectPass!',
      });
      expect(typeof result.user.createdAt).toBe('string');
      expect(new Date(result.user.createdAt).toISOString()).toBe(result.user.createdAt);
    });

    it('response contains accessToken as string', async () => {
      const result = await controller.login({
        email: 'user@example.com',
        password: 'CorrectPass!',
      });
      expect(typeof result.accessToken).toBe('string');
      expect(result.accessToken.length).toBeGreaterThan(0);
    });

    it('throws UnauthorizedException on wrong email', async () => {
      await expect(
        controller.login({ email: 'wrong@example.com', password: 'CorrectPass!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on wrong password', async () => {
      await expect(
        controller.login({ email: 'user@example.com', password: 'WrongPass!' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('GET /auth/me', () => {
    it('returns user data for authenticated user', async () => {
      const registered = await controller.register({
        email: 'me@example.com',
        password: 'MyPass123!',
      });
      const me = await controller.me({ id: registered.user.id, email: 'me@example.com' });
      expect(me.id).toBe(registered.user.id);
      expect(me.email).toBe('me@example.com');
      expect(me.createdAt).toBeDefined();
    });

    it('throws UnauthorizedException if user no longer exists', async () => {
      await expect(
        controller.me({ id: '550e8400-e29b-41d4-a716-446655440099', email: 'ghost@example.com' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
