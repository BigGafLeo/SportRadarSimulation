import { RegisterUseCase } from '@auth/application/use-cases/register.use-case';
import { InMemoryUserRepository } from '@auth/infrastructure/persistence/in-memory-user.repository';
import { FakePasswordHasher } from '@auth/infrastructure/security/fake-password-hasher';
import { EmailAlreadyExistsError } from '@auth/domain/errors/email-already-exists.error';
import { Email } from '@auth/domain/value-objects/email';

describe('RegisterUseCase', () => {
  let repo: InMemoryUserRepository;
  let hasher: FakePasswordHasher;
  let useCase: RegisterUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    hasher = new FakePasswordHasher();
    useCase = new RegisterUseCase(repo, hasher);
  });

  it('registers a new user and returns user data', async () => {
    const result = await useCase.execute({
      email: 'new@example.com',
      password: 'StrongPass1!',
    });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.email).toBe('new@example.com');
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('saves user to repository', async () => {
    const result = await useCase.execute({
      email: 'new@example.com',
      password: 'StrongPass1!',
    });
    const found = await repo.findByEmail(Email.create('new@example.com'));
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(result.id);
  });

  it('hashes the password before saving', async () => {
    await useCase.execute({
      email: 'new@example.com',
      password: 'StrongPass1!',
    });
    const found = await repo.findByEmail(Email.create('new@example.com'));
    expect(found!.passwordHash.value).toBe('fake:StrongPass1!');
  });

  it('throws EmailAlreadyExistsError on duplicate email', async () => {
    await useCase.execute({ email: 'dup@example.com', password: 'StrongPass1!' });
    await expect(
      useCase.execute({ email: 'dup@example.com', password: 'AnotherPass1!' }),
    ).rejects.toThrow(EmailAlreadyExistsError);
  });

  it('normalizes email to lowercase', async () => {
    const result = await useCase.execute({
      email: 'User@Example.COM',
      password: 'StrongPass1!',
    });
    expect(result.email).toBe('user@example.com');
  });

  it('returned user data does NOT contain password or hash fields', async () => {
    const result = await useCase.execute({
      email: 'clean@example.com',
      password: 'StrongPass1!',
    });
    expect(result.id).toBeDefined();
    expect(result.email).toBeDefined();
    expect(result.createdAt).toBeDefined();
    const r = result as unknown as Record<string, unknown>;
    expect(r.password).toBeUndefined();
    expect(r.passwordHash).toBeUndefined();
    expect(r.hash).toBeUndefined();
  });

  it('email is normalized (lowercased) before saving — verified via repository spy', async () => {
    const saveSpy = jest.spyOn(repo, 'save');
    await useCase.execute({ email: 'Mixed@EXAMPLE.com', password: 'StrongPass1!' });
    expect(saveSpy).toHaveBeenCalledTimes(1);
    const savedUser = saveSpy.mock.calls[0][0];
    expect(savedUser.email.value).toBe('mixed@example.com');
  });
});
