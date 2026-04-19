import argon2 from 'argon2';
import type { PasswordHasher } from '@auth/domain/ports/password-hasher.port';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<HashedPassword> {
    const hashed = await argon2.hash(plain);
    return HashedPassword.fromHash(hashed);
  }

  async verify(plain: string, hash: HashedPassword): Promise<boolean> {
    return argon2.verify(hash.value, plain);
  }
}
