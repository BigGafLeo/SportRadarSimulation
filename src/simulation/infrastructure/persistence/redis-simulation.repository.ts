import { Simulation, type SimulationSnapshot } from '@simulation/domain/aggregates/simulation';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import type { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import type { Match } from '@simulation/domain/value-objects/match';
import type { RedisClient } from '@shared/infrastructure/redis.client';

const HASH_KEY = 'simulations';

interface SerializedSnapshot extends Omit<SimulationSnapshot, 'startedAt' | 'finishedAt'> {
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

/**
 * Redis-backed SimulationRepository.
 * Storage: HSET `simulations` with field = simulationId, value = JSON snapshot.
 * findAll uses HVALS; findByOwner filters in memory (acceptable at MVP scale,
 * Phase 4 will switch to Postgres with proper indexes).
 * Aggregate reconstruction uses `PRESET_MATCHES` (or later, profile-specific matches).
 */
export class RedisSimulationRepository implements SimulationRepository {
  constructor(
    private readonly client: RedisClient,
    private readonly matches: readonly Match[],
  ) {}

  async save(simulation: Simulation): Promise<void> {
    const snap = simulation.toSnapshot();
    await this.client.hset(HASH_KEY, snap.id, JSON.stringify(this.serialize(snap)));
  }

  async findById(id: SimulationId): Promise<Simulation | null> {
    const raw = await this.client.hget(HASH_KEY, id.value);
    if (raw === null) return null;
    return this.deserialize(JSON.parse(raw) as SerializedSnapshot);
  }

  async findAll(): Promise<readonly Simulation[]> {
    const all = await this.client.hvals(HASH_KEY);
    return all.map((raw) => this.deserialize(JSON.parse(raw) as SerializedSnapshot));
  }

  async findByOwner(token: OwnershipToken): Promise<readonly Simulation[]> {
    const all = await this.findAll();
    return all.filter((s) => s.ownerToken.equals(token));
  }

  async delete(id: SimulationId): Promise<void> {
    await this.client.hdel(HASH_KEY, id.value);
  }

  private serialize(snap: SimulationSnapshot): SerializedSnapshot {
    return {
      ...snap,
      startedAt: snap.startedAt.toISOString(),
      finishedAt: snap.finishedAt ? snap.finishedAt.toISOString() : null,
    };
  }

  private deserialize(raw: SerializedSnapshot): Simulation {
    const snap: SimulationSnapshot = {
      ...raw,
      startedAt: new Date(raw.startedAt),
      finishedAt: raw.finishedAt ? new Date(raw.finishedAt) : null,
    };
    return Simulation.fromSnapshot(snap, this.matches);
  }
}
