import { InMemorySimulationRepository } from '@simulation/infrastructure/persistence/in-memory-simulation.repository';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';

function makeSim(
  idStr: string,
  ownerId: string,
  now = new Date('2026-04-18T12:00:00Z'),
): Simulation {
  return Simulation.create({
    id: SimulationId.create(idStr),
    ownerId,
    name: SimulationName.create('Katar 2023'),
    matches: PRESET_MATCHES,
    profileId: 'default',
    now,
  });
}

describe('InMemorySimulationRepository', () => {
  const id1 = '550e8400-e29b-41d4-a716-446655440000';
  const id2 = '550e8400-e29b-41d4-a716-446655440002';
  const userA = 'user-a-uuid';
  const userB = 'user-b-uuid';

  it('findById returns null when not saved', async () => {
    const repo = new InMemorySimulationRepository();
    const result = await repo.findById(SimulationId.create(id1));
    expect(result).toBeNull();
  });

  it('save + findById round-trip', async () => {
    const repo = new InMemorySimulationRepository();
    const sim = makeSim(id1, userA);
    await repo.save(sim);
    const found = await repo.findById(SimulationId.create(id1));
    expect(found?.id.value).toBe(id1);
  });

  it('save overwrites existing by id', async () => {
    const repo = new InMemorySimulationRepository();
    const first = makeSim(id1, userA);
    await repo.save(first);
    const second = makeSim(id1, userA);
    await repo.save(second);
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
  });

  it('findAll returns all saved simulations', async () => {
    const repo = new InMemorySimulationRepository();
    await repo.save(makeSim(id1, userA));
    await repo.save(makeSim(id2, userB));
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.id.value).sort()).toEqual([id1, id2].sort());
  });

  it('findByOwner filters by ownerId', async () => {
    const repo = new InMemorySimulationRepository();
    await repo.save(makeSim(id1, userA));
    await repo.save(makeSim(id2, userB));
    const byA = await repo.findByOwner(userA);
    expect(byA).toHaveLength(1);
    expect(byA[0].id.value).toBe(id1);
  });

  it('findLastStartedAtByOwner returns null when no simulations for owner', async () => {
    const repo = new InMemorySimulationRepository();
    const result = await repo.findLastStartedAtByOwner(userA);
    expect(result).toBeNull();
  });

  it('findLastStartedAtByOwner returns latest startedAt across owner simulations', async () => {
    const repo = new InMemorySimulationRepository();
    const t1 = new Date('2026-04-18T10:00:00Z');
    const t2 = new Date('2026-04-18T11:00:00Z');
    await repo.save(makeSim(id1, userA, t1));
    await repo.save(makeSim(id2, userA, t2));
    const last = await repo.findLastStartedAtByOwner(userA);
    expect(last).toEqual(t2);
  });

  it('findLastStartedAtByOwner is scoped per owner', async () => {
    const repo = new InMemorySimulationRepository();
    const t1 = new Date('2026-04-18T10:00:00Z');
    await repo.save(makeSim(id1, userA, t1));
    const lastForB = await repo.findLastStartedAtByOwner(userB);
    expect(lastForB).toBeNull();
  });

  it('delete removes simulation', async () => {
    const repo = new InMemorySimulationRepository();
    await repo.save(makeSim(id1, userA));
    await repo.delete(SimulationId.create(id1));
    const found = await repo.findById(SimulationId.create(id1));
    expect(found).toBeNull();
  });

  it('delete is idempotent when id absent', async () => {
    const repo = new InMemorySimulationRepository();
    await expect(repo.delete(SimulationId.create(id1))).resolves.not.toThrow();
  });

  it('findByOwner with non-existent ownerId returns empty array', async () => {
    const repo = new InMemorySimulationRepository();
    await repo.save(makeSim(id1, userA));
    const result = await repo.findByOwner('non-existent-user-id');
    expect(result).toEqual([]);
  });

  it('findAll on empty repo returns empty array', async () => {
    const repo = new InMemorySimulationRepository();
    const result = await repo.findAll();
    expect(result).toEqual([]);
  });
});
