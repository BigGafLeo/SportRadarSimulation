import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '@shared/config/config.schema';
import type { UserRepository } from '@auth/domain/ports/user-repository.port';

export async function createUserRepository(
  config: ConfigService<AppConfig, true>,
): Promise<UserRepository> {
  const mode = config.get('PERSISTENCE_MODE', { infer: true });
  if (mode === 'postgres') {
    const { getPrismaClient } = await import('../../../shared/infrastructure/prisma.client');
    const { PostgresUserRepository } = await import('./postgres-user.repository');
    const prisma = getPrismaClient(config.get('DATABASE_URL', { infer: true }));
    return new PostgresUserRepository(prisma);
  }
  const { InMemoryUserRepository } = await import('./in-memory-user.repository');
  return new InMemoryUserRepository();
}
