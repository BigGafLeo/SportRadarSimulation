import { createSimulationRepository } from '@simulation/infrastructure/persistence/simulation-repository.factory';
import { InMemorySimulationRepository } from '@simulation/infrastructure/persistence/in-memory-simulation.repository';
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

describe('createSimulationRepository', () => {
  it('returns InMemorySimulationRepository when persistenceMode is "inmemory"', async () => {
    const repo = await createSimulationRepository(makeConfig('inmemory'));
    expect(repo).toBeInstanceOf(InMemorySimulationRepository);
  });

  it('returns a repository with save() and findById() when persistenceMode is "inmemory"', async () => {
    const repo = await createSimulationRepository(makeConfig('inmemory'));
    expect(typeof repo.save).toBe('function');
    expect(typeof repo.findById).toBe('function');
  });

  it('returns PostgresSimulationRepository when persistenceMode is "postgres"', async () => {
    const { PostgresSimulationRepository } =
      await import('@simulation/infrastructure/persistence/postgres-simulation.repository');
    const repo = await createSimulationRepository(makeConfig('postgres'));
    expect(repo).toBeInstanceOf(PostgresSimulationRepository);
  });
});
