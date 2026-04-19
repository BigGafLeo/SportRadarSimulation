import { InMemoryUserRepository } from '@auth/infrastructure/persistence/in-memory-user.repository';
import { User } from '@auth/domain/aggregates/user';
import { UserId } from '@auth/domain/value-objects/user-id';
import { Email } from '@auth/domain/value-objects/email';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

function makeUser(overrides: { id?: string; email?: string } = {}): User {
  return User.create({
    id: UserId.create(overrides.id ?? '550e8400-e29b-41d4-a716-446655440000'),
    email: Email.create(overrides.email ?? 'user@example.com'),
    passwordHash: HashedPassword.fromHash('$argon2id$hash'),
    createdAt: new Date('2026-04-19T12:00:00Z'),
  });
}

describe('InMemoryUserRepository', () => {
  let repo: InMemoryUserRepository;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
  });

  it('saves and finds by email', async () => {
    const user = makeUser();
    await repo.save(user);
    const found = await repo.findByEmail(Email.create('user@example.com'));
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(user.id.value);
  });

  it('saves and finds by id', async () => {
    const user = makeUser();
    await repo.save(user);
    const found = await repo.findById(user.id);
    expect(found).not.toBeNull();
    expect(found!.email.value).toBe('user@example.com');
  });

  it('returns null for unknown email', async () => {
    const found = await repo.findByEmail(Email.create('unknown@example.com'));
    expect(found).toBeNull();
  });

  it('returns null for unknown id', async () => {
    const found = await repo.findById(UserId.create('660e8400-e29b-41d4-a716-446655440001'));
    expect(found).toBeNull();
  });

  it('overwrites user on duplicate id', async () => {
    const user1 = makeUser({ email: 'first@example.com' });
    await repo.save(user1);
    const user2 = makeUser({ email: 'second@example.com' });
    await repo.save(user2);
    const found = await repo.findById(user1.id);
    expect(found!.email.value).toBe('second@example.com');
  });
});
