import type { PasswordHasher } from '@auth/domain/ports/password-hasher.port';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

export class FakePasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<HashedPassword> {
    return HashedPassword.fromHash(`fake:${plain}`);
  }

  async verify(plain: string, hash: HashedPassword): Promise<boolean> {
    return hash.value === `fake:${plain}`;
  }
}
