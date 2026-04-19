import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

describe('HashedPassword', () => {
  it('wraps a hash string', () => {
    const hp = HashedPassword.fromHash('$argon2id$v=19$m=65536,t=3,p=4$abc$def');
    expect(hp.value).toBe('$argon2id$v=19$m=65536,t=3,p=4$abc$def');
  });

  it('throws on empty string', () => {
    expect(() => HashedPassword.fromHash('')).toThrow();
  });
});
