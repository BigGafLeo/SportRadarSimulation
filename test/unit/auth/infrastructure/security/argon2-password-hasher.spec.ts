import { Argon2PasswordHasher } from '@auth/infrastructure/security/argon2-password-hasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('hash produces an argon2id string', async () => {
    const hashed = await hasher.hash('MyPassword123');
    expect(hashed.value).toMatch(/^\$argon2id\$/);
  });

  it('verify returns true for correct password', async () => {
    const hashed = await hasher.hash('MyPassword123');
    const result = await hasher.verify('MyPassword123', hashed);
    expect(result).toBe(true);
  });

  it('verify returns false for wrong password', async () => {
    const hashed = await hasher.hash('MyPassword123');
    const result = await hasher.verify('WrongPassword', hashed);
    expect(result).toBe(false);
  });

  it('same password produces different hashes (random salt)', async () => {
    const h1 = await hasher.hash('SamePassword');
    const h2 = await hasher.hash('SamePassword');
    expect(h1.value).not.toBe(h2.value);
  });
});
