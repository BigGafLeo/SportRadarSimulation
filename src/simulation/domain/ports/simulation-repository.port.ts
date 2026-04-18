import type { Simulation } from '../aggregates/simulation';
import type { SimulationId } from '../value-objects/simulation-id';
import type { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';

/**
 * Persistence port for Simulation aggregate.
 * Default impl: InMemorySimulationRepository (Phase 1b). Future: PostgresSimulationRepository (Phase 4).
 */
export interface SimulationRepository {
  save(simulation: Simulation): Promise<void>;
  findById(id: SimulationId): Promise<Simulation | null>;
  findAll(): Promise<readonly Simulation[]>;
  findByOwner(token: OwnershipToken): Promise<readonly Simulation[]>;
  delete(id: SimulationId): Promise<void>;
}
