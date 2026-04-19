import type { UserRepository } from '@auth/domain/ports/user-repository.port';
import type { User } from '@auth/domain/aggregates/user';
import type { Email } from '@auth/domain/value-objects/email';
import type { UserId } from '@auth/domain/value-objects/user-id';

export class InMemoryUserRepository implements UserRepository {
  private readonly store = new Map<string, User>();

  async save(user: User): Promise<void> {
    this.store.set(user.id.value, user);
  }

  async findByEmail(email: Email): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.email.equals(email)) return user;
    }
    return null;
  }

  async findById(id: UserId): Promise<User | null> {
    return this.store.get(id.value) ?? null;
  }
}
