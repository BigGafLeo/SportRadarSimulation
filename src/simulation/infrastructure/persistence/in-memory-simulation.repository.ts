import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { SimulationId } from '@simulation/domain/value-objects/simulation-id';

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

  async findByOwner(ownerId: string): Promise<readonly Simulation[]> {
    return Array.from(this.store.values()).filter((s) => s.ownerId === ownerId);
  }

  async findLastStartedAtByOwner(ownerId: string): Promise<Date | null> {
    const sims = await this.findByOwner(ownerId);
    if (sims.length === 0) return null;
    const dates = sims.map((s) => s.toSnapshot().startedAt.getTime());
    return new Date(Math.max(...dates));
  }

  async delete(id: SimulationId): Promise<void> {
    this.store.delete(id.value);
  }
}
