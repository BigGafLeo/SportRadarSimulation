import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

describe('HashedPassword', () => {
  it('wraps a hash string', () => {
    const hp = HashedPassword.fromHash('$argon2id$v=19$m=65536,t=3,p=4$abc$def');
    expect(hp.value).toBe('$argon2id$v=19$m=65536,t=3,p=4$abc$def');
  });

  it('throws on empty string', () => {
    expect(() => HashedPassword.fromHash('')).toThrow();
  });

  it('accepts whitespace-only string (no validation beyond non-empty)', () => {
    // HashedPassword.fromHash only guards against falsy (empty string).
    // A whitespace-only string is truthy, so it is accepted as-is.
    const hp = HashedPassword.fromHash('   ');
    expect(hp.value).toBe('   ');
  });

  it('value property stores the exact hash passed in', () => {
    const rawHash = '$argon2id$v=19$m=65536,t=3,p=4$somesalt$somehashhereXYZ';
    const hp = HashedPassword.fromHash(rawHash);
    expect(hp.value).toBe(rawHash);
  });
});
