import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '@shared/config/config.schema';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';

export async function createSimulationRepository(
  config: ConfigService<AppConfig, true>,
): Promise<SimulationRepository> {
  const mode = config.get('PERSISTENCE_MODE', { infer: true });
  if (mode === 'postgres') {
    const { getPrismaClient } = await import('../../../shared/infrastructure/prisma.client');
    const { PostgresSimulationRepository } = await import('./postgres-simulation.repository');
    const { PRESET_MATCHES } = await import('../../domain/value-objects/matches-preset');
    const prisma = getPrismaClient(config.get('DATABASE_URL', { infer: true }));
    return new PostgresSimulationRepository(prisma, PRESET_MATCHES);
  }
  const { InMemorySimulationRepository } = await import('./in-memory-simulation.repository');
  return new InMemorySimulationRepository();
}
