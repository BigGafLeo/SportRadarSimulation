import { LoginUseCase } from '@auth/application/use-cases/login.use-case';
import { InMemoryUserRepository } from '@auth/infrastructure/persistence/in-memory-user.repository';
import { FakePasswordHasher } from '@auth/infrastructure/security/fake-password-hasher';
import { InvalidCredentialsError } from '@auth/domain/errors/invalid-credentials.error';
import { User } from '@auth/domain/aggregates/user';
import { UserId } from '@auth/domain/value-objects/user-id';
import { Email } from '@auth/domain/value-objects/email';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

describe('LoginUseCase', () => {
  let repo: InMemoryUserRepository;
  let hasher: FakePasswordHasher;
  let useCase: LoginUseCase;

  const userId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    repo = new InMemoryUserRepository();
    hasher = new FakePasswordHasher();
    useCase = new LoginUseCase(repo, hasher);

    const user = User.create({
      id: UserId.create(userId),
      email: Email.create('user@example.com'),
      passwordHash: await hasher.hash('CorrectPass1!'),
      createdAt: new Date('2026-04-19T12:00:00Z'),
    });
    await repo.save(user);
  });

  it('returns user data on valid credentials', async () => {
    const result = await useCase.execute({
      email: 'user@example.com',
      password: 'CorrectPass1!',
    });
    expect(result.id).toBe(userId);
    expect(result.email).toBe('user@example.com');
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('throws InvalidCredentialsError for non-existent email', async () => {
    await expect(
      useCase.execute({ email: 'nobody@example.com', password: 'CorrectPass1!' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('throws InvalidCredentialsError for wrong password', async () => {
    await expect(
      useCase.execute({ email: 'user@example.com', password: 'WrongPass!' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('normalizes email before lookup', async () => {
    const result = await useCase.execute({
      email: 'User@Example.COM',
      password: 'CorrectPass1!',
    });
    expect(result.id).toBe(userId);
  });

  it('throws InvalidCredentialsError for empty password (not a different error)', async () => {
    await expect(useCase.execute({ email: 'user@example.com', password: '' })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('return value contains id, email and createdAt — no password fields', async () => {
    const result = await useCase.execute({
      email: 'user@example.com',
      password: 'CorrectPass1!',
    });
    expect(result.id).toBe(userId);
    expect(result.email).toBe('user@example.com');
    expect(result.createdAt).toBeInstanceOf(Date);
    // Must not expose any password field
    const r = result as unknown as Record<string, unknown>;
    expect(r.password).toBeUndefined();
    expect(r.passwordHash).toBeUndefined();
    expect(r.hash).toBeUndefined();
  });

  it('calls passwordHasher.verify even when user is not found (timing-safe DUMMY_HASH path)', async () => {
    const verifySpy = jest.spyOn(hasher, 'verify');
    await expect(
      useCase.execute({ email: 'nobody@example.com', password: 'SomePassword!' }),
    ).rejects.toThrow(InvalidCredentialsError);
    // verify() must have been called with the dummy hash so timing is constant
    expect(verifySpy).toHaveBeenCalledTimes(1);
    const [, hashArg] = verifySpy.mock.calls[0] as [string, HashedPassword];
    // The dummy hash starts with $argon2id$ — it is NOT the stored user hash
    expect(hashArg).toBeInstanceOf(HashedPassword);
    expect(hashArg.value).toMatch(/^\$argon2id\$/);
  });
});
