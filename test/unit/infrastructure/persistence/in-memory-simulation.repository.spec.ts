import { InMemorySimulationRepository } from '@simulation/infrastructure/persistence/in-memory-simulation.repository';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';

function makeSim(idStr: string, tokenStr: string): Simulation {
  return Simulation.create({
    id: SimulationId.create(idStr),
    ownerToken: OwnershipToken.create(tokenStr),
    name: SimulationName.create('Katar 2023'),
    matches: PRESET_MATCHES,
    profileId: 'default',
    now: new Date('2026-04-18T12:00:00Z'),
  });
}

describe('InMemorySimulationRepository', () => {
  const id1 = '550e8400-e29b-41d4-a716-446655440000';
  const id2 = '550e8400-e29b-41d4-a716-446655440002';
  const tokenA = '550e8400-e29b-41d4-a716-446655440010';
  const tokenB = '550e8400-e29b-41d4-a716-446655440011';

  it('findById returns null when not saved', async () => {
    const repo = new InMemorySimulationRepository();
    const result = await repo.findById(SimulationId.create(id1));
    expect(result).toBeNull();
  });

  it('save + findById round-trip', async () => {
    const repo = new InMemorySimulationRepository();
    const sim = makeSim(id1, tokenA);
    await repo.save(sim);
    const found = await repo.findById(SimulationId.create(id1));
    expect(found?.id.value).toBe(id1);
  });

  it('save overwrites existing by id', async () => {
    const repo = new InMemorySimulationRepository();
    const first = makeSim(id1, tokenA);
    await repo.save(first);
    const second = makeSim(id1, tokenA);
    await repo.save(second);
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
  });

  it('findAll returns all saved simulations', async () => {
    const repo = new InMemorySimulationRepository();
    await repo.save(makeSim(id1, tokenA));
    await repo.save(makeSim(id2, tokenB));
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.id.value).sort()).toEqual([id1, id2].sort());
  });

  it('findByOwner filters by ownerToken', async () => {
    const repo = new InMemorySimulationRepository();
    await repo.save(makeSim(id1, tokenA));
    await repo.save(makeSim(id2, tokenB));
    const byA = await repo.findByOwner(OwnershipToken.create(tokenA));
    expect(byA).toHaveLength(1);
    expect(byA[0].id.value).toBe(id1);
  });

  it('delete removes simulation', async () => {
    const repo = new InMemorySimulationRepository();
    await repo.save(makeSim(id1, tokenA));
    await repo.delete(SimulationId.create(id1));
    const found = await repo.findById(SimulationId.create(id1));
    expect(found).toBeNull();
  });

  it('delete is idempotent when id absent', async () => {
    const repo = new InMemorySimulationRepository();
    await expect(repo.delete(SimulationId.create(id1))).resolves.not.toThrow();
  });
});
