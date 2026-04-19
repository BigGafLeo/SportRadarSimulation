import type { User } from '../aggregates/user';
import type { Email } from '../value-objects/email';
import type { UserId } from '../value-objects/user-id';

export interface UserRepository {
  save(user: User): Promise<void>;
  findByEmail(email: Email): Promise<User | null>;
  findById(id: UserId): Promise<User | null>;
}
