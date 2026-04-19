import type { HashedPassword } from '../value-objects/hashed-password';

export interface PasswordHasher {
  hash(plain: string): Promise<HashedPassword>;
  verify(plain: string, hash: HashedPassword): Promise<boolean>;
}
