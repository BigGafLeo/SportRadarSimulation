import { createUserRepository } from '@auth/infrastructure/persistence/user-repository.factory';
import { InMemoryUserRepository } from '@auth/infrastructure/persistence/in-memory-user.repository';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '@shared/config/config.schema';

function makeConfig(mode: string): ConfigService<AppConfig, true> {
  return {
    get: (_key: string) => {
      if (_key === 'PERSISTENCE_MODE') return mode;
      if (_key === 'DATABASE_URL') return 'postgresql://test:test@localhost:5432/testdb';
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
}

describe('createUserRepository', () => {
  it('returns InMemoryUserRepository when persistenceMode is "inmemory"', async () => {
    const repo = await createUserRepository(makeConfig('inmemory'));
    expect(repo).toBeInstanceOf(InMemoryUserRepository);
  });

  it('returns a repository with save(), findByEmail(), findById() when persistenceMode is "inmemory"', async () => {
    const repo = await createUserRepository(makeConfig('inmemory'));
    expect(typeof repo.save).toBe('function');
    expect(typeof repo.findByEmail).toBe('function');
    expect(typeof repo.findById).toBe('function');
  });

  it('returns PostgresUserRepository when persistenceMode is "postgres"', async () => {
    const { PostgresUserRepository } =
      await import('@auth/infrastructure/persistence/postgres-user.repository');
    const repo = await createUserRepository(makeConfig('postgres'));
    expect(repo).toBeInstanceOf(PostgresUserRepository);
  });
});
