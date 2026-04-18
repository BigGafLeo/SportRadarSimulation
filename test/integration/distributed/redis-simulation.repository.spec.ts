import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { RedisSimulationRepository } from '@simulation/infrastructure/persistence/redis-simulation.repository';
import { createRedisClient, type RedisClient } from '@shared/infrastructure/redis.client';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';

jest.setTimeout(60_000);

describe('RedisSimulationRepository (Testcontainers)', () => {
  let container: StartedTestContainer;
  let client: RedisClient;
  let repo: RedisSimulationRepository;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
    client = createRedisClient(url);
    await client.connect();
    repo = new RedisSimulationRepository(client, PRESET_MATCHES);
  });

  afterAll(async () => {
    await client.quit();
    await container.stop();
  });

  beforeEach(async () => {
    await client.flushdb();
  });

  function makeSim(idStr: string, tokenStr: string, name = 'Katar 2023'): Simulation {
    return Simulation.create({
      id: SimulationId.create(idStr),
      ownerToken: OwnershipToken.create(tokenStr),
      name: SimulationName.create(name),
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: new Date('2026-04-18T12:00:00Z'),
    });
  }

  const id1 = '550e8400-e29b-41d4-a716-446655440000';
  const id2 = '550e8400-e29b-41d4-a716-446655440002';
  const tokA = '550e8400-e29b-41d4-a716-446655440010';
  const tokB = '550e8400-e29b-41d4-a716-446655440011';

  it('findById returns null when not saved', async () => {
    const r = await repo.findById(SimulationId.create(id1));
    expect(r).toBeNull();
  });

  it('save + findById round-trip preserves snapshot', async () => {
    const orig = makeSim(id1, tokA);
    await repo.save(orig);
    const loaded = await repo.findById(SimulationId.create(id1));
    expect(loaded).not.toBeNull();
    expect(loaded!.toSnapshot()).toEqual(orig.toSnapshot());
  });

  it('findAll returns all saved simulations', async () => {
    await repo.save(makeSim(id1, tokA));
    await repo.save(makeSim(id2, tokB));
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.id.value).sort()).toEqual([id1, id2].sort());
  });

  it('findByOwner filters correctly', async () => {
    await repo.save(makeSim(id1, tokA));
    await repo.save(makeSim(id2, tokB));
    const byA = await repo.findByOwner(OwnershipToken.create(tokA));
    expect(byA).toHaveLength(1);
    expect(byA[0].id.value).toBe(id1);
  });

  it('delete removes entry', async () => {
    await repo.save(makeSim(id1, tokA));
    await repo.delete(SimulationId.create(id1));
    const r = await repo.findById(SimulationId.create(id1));
    expect(r).toBeNull();
  });
});
