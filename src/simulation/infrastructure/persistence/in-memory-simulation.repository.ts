import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import type { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';

export class InMemorySimulationRepository implements SimulationRepository {
  private readonly store = new Map<string, Simulation>();

  async save(simulation: Simulation): Promise<void> {
    this.store.set(simulation.id.value, simulation);
  }

  async findById(id: SimulationId): Promise<Simulation | null> {
    return this.store.get(id.value) ?? null;
  }

  async findAll(): Promise<readonly Simulation[]> {
    return Array.from(this.store.values());
  }

  async findByOwner(token: OwnershipToken): Promise<readonly Simulation[]> {
    return Array.from(this.store.values()).filter((s) => s.ownerToken.equals(token));
  }

  async delete(id: SimulationId): Promise<void> {
    this.store.delete(id.value);
  }
}
