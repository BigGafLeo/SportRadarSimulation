import { User } from '@auth/domain/aggregates/user';
import { UserId } from '@auth/domain/value-objects/user-id';
import { Email } from '@auth/domain/value-objects/email';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

describe('User', () => {
  const id = UserId.create('550e8400-e29b-41d4-a716-446655440000');
  const email = Email.create('user@example.com');
  const hash = HashedPassword.fromHash('$argon2id$hash');
  const now = new Date('2026-04-19T12:00:00Z');

  it('creates a user with all fields', () => {
    const user = User.create({ id, email, passwordHash: hash, createdAt: now });
    expect(user.id.value).toBe(id.value);
    expect(user.email.value).toBe('user@example.com');
    expect(user.passwordHash.value).toBe('$argon2id$hash');
    expect(user.createdAt).toEqual(now);
  });

  it('reconstructs from snapshot', () => {
    const user = User.fromSnapshot({
      id: id.value,
      email: 'user@example.com',
      passwordHash: '$argon2id$hash',
      createdAt: now,
    });
    expect(user.id.value).toBe(id.value);
    expect(user.email.value).toBe('user@example.com');
  });

  it('toSnapshot roundtrips', () => {
    const user = User.create({ id, email, passwordHash: hash, createdAt: now });
    const snap = user.toSnapshot();
    const restored = User.fromSnapshot(snap);
    expect(restored.id.equals(user.id)).toBe(true);
    expect(restored.email.equals(user.email)).toBe(true);
    expect(restored.passwordHash.value).toBe(user.passwordHash.value);
    expect(restored.createdAt).toEqual(user.createdAt);
  });

  it('exposes all properties correctly after creation', () => {
    const user = User.create({ id, email, passwordHash: hash, createdAt: now });
    expect(user.id).toBe(id);
    expect(user.email).toBe(email);
    expect(user.passwordHash).toBe(hash);
    expect(user.createdAt).toBe(now);
  });

  it('two users with the same id are the same entity (id-based identity)', () => {
    const user1 = User.create({ id, email, passwordHash: hash, createdAt: now });
    const user2 = User.create({
      id,
      email: Email.create('other@example.com'),
      passwordHash: HashedPassword.fromHash('$argon2id$other'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    // User aggregate does not have an equals() method; identity is checked via id VO
    expect(user1.id.equals(user2.id)).toBe(true);
  });
});
