import type { PrismaClient } from '@prisma/client';
import type { UserRepository } from '@auth/domain/ports/user-repository.port';
import { User } from '@auth/domain/aggregates/user';
import type { Email } from '@auth/domain/value-objects/email';
import type { UserId } from '@auth/domain/value-objects/user-id';

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(user: User): Promise<void> {
    const snap = user.toSnapshot();
    await this.prisma.user.create({
      data: {
        id: snap.id,
        email: snap.email,
        passwordHash: snap.passwordHash,
        createdAt: snap.createdAt,
      },
    });
  }

  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { email: email.value },
    });
    if (!row) return null;
    return User.fromSnapshot({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
    });
  }

  async findById(id: UserId): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: id.value },
    });
    if (!row) return null;
    return User.fromSnapshot({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
    });
  }
}
