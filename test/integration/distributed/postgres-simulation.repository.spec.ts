import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { PostgresSimulationRepository } from '@simulation/infrastructure/persistence/postgres-simulation.repository';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';

describe('PostgresSimulationRepository (Testcontainers)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repo: PostgresSimulationRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test')
      .withUsername('test')
      .withPassword('test')
      .start();
    const url = container.getConnectionUri();
    execSync(`npx prisma migrate deploy`, {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
    });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    repo = new PostgresSimulationRepository(prisma, PRESET_MATCHES);
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  }, 60_000);

  beforeEach(async () => {
    await prisma.simulation.deleteMany({});
  });

  function makeSim(idSuffix = '0'): Simulation {
    const id = `aaaaaaaa-bbbb-4ccc-8ddd-${idSuffix.padStart(12, '0')}`;
    return Simulation.create({
      id: SimulationId.create(id),
      ownerId: '550e8400-e29b-41d4-a716-446655440010',
      name: SimulationName.create('Test Match Name'),
      matches: PRESET_MATCHES,
      profileId: 'uniform-realtime',
      now: new Date('2026-04-19T12:00:00Z'),
    });
  }

  it('save inserts a new row', async () => {
    const sim = makeSim('a');
    await repo.save(sim);
    const row = await prisma.simulation.findUnique({ where: { id: sim.id.value } });
    expect(row).not.toBeNull();
    expect(row?.name).toBe('Test Match Name');
    expect(row?.state).toBe('RUNNING');
    expect(row?.totalGoals).toBe(0);
  });

  it('save updates existing row (upsert)', async () => {
    const sim = makeSim('b');
    await repo.save(sim);
    sim.applyGoal(PRESET_MATCHES[0].home.id, new Date('2026-04-19T12:00:01Z'));
    await repo.save(sim);
    const row = await prisma.simulation.findUnique({ where: { id: sim.id.value } });
    expect(row?.totalGoals).toBe(1);
  });

  it('findById returns null for unknown id', async () => {
    const result = await repo.findById(SimulationId.create('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'));
    expect(result).toBeNull();
  });

  it('findById round-trips score JSONB correctly', async () => {
    const sim = makeSim('c');
    sim.applyGoal(PRESET_MATCHES[0].home.id, new Date('2026-04-19T12:00:01Z'));
    sim.applyGoal(PRESET_MATCHES[0].away.id, new Date('2026-04-19T12:00:02Z'));
    await repo.save(sim);
    const loaded = await repo.findById(sim.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.toSnapshot().totalGoals).toBe(2);
    const matchScore = loaded!
      .toSnapshot()
      .score.find((s) => s.matchId === PRESET_MATCHES[0].id.value);
    expect(matchScore?.home).toBe(1);
    expect(matchScore?.away).toBe(1);
  });

  it('findAll returns simulations ordered by startedAt desc', async () => {
    const a = makeSim('a');
    await repo.save(a);
    await new Promise((r) => setTimeout(r, 10));
    const bSim = Simulation.create({
      id: SimulationId.create('aaaaaaaa-bbbb-4ccc-8ddd-bbbbbbbbbbbb'),
      ownerId: '550e8400-e29b-41d4-a716-446655440010',
      name: SimulationName.create('Second Match Name'),
      matches: PRESET_MATCHES,
      profileId: 'uniform-realtime',
      now: new Date('2026-04-19T13:00:00Z'),
    });
    await repo.save(bSim);
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
    expect(all[0].id.value).toBe(bSim.id.value); // newer first
  });

  it('findByOwner filters by ownerId', async () => {
    const ownerIdA = '550e8400-e29b-41d4-a716-446655440010';
    const ownerIdB = '550e8400-e29b-41d4-a716-446655440011';
    const simA = makeSim('a');
    const simB = Simulation.create({
      id: SimulationId.create('aaaaaaaa-bbbb-4ccc-8ddd-bbbbbbbbbbbb'),
      ownerId: ownerIdB,
      name: SimulationName.create('Other Owner Sim'),
      matches: PRESET_MATCHES,
      profileId: 'uniform-realtime',
      now: new Date('2026-04-19T12:00:00Z'),
    });
    await repo.save(simA);
    await repo.save(simB);
    const ownedByA = await repo.findByOwner(ownerIdA);
    expect(ownedByA).toHaveLength(1);
    expect(ownedByA[0].id.value).toBe(simA.id.value);
  });

  it('findLastStartedAtByOwner returns null when no simulations for owner', async () => {
    const result = await repo.findLastStartedAtByOwner('550e8400-e29b-41d4-a716-446655440099');
    expect(result).toBeNull();
  });

  it('findLastStartedAtByOwner returns latest startedAt across owner simulations', async () => {
    const ownerId = '550e8400-e29b-41d4-a716-446655440010';
    const t1 = new Date('2026-04-19T10:00:00Z');
    const t2 = new Date('2026-04-19T11:00:00Z');
    const sim1 = Simulation.create({
      id: SimulationId.create('aaaaaaaa-bbbb-4ccc-8ddd-000000000001'),
      ownerId,
      name: SimulationName.create('Earlier Sim'),
      matches: PRESET_MATCHES,
      profileId: 'uniform-realtime',
      now: t1,
    });
    const sim2 = Simulation.create({
      id: SimulationId.create('aaaaaaaa-bbbb-4ccc-8ddd-000000000002'),
      ownerId,
      name: SimulationName.create('Later Sim'),
      matches: PRESET_MATCHES,
      profileId: 'uniform-realtime',
      now: t2,
    });
    await repo.save(sim1);
    await repo.save(sim2);
    const last = await repo.findLastStartedAtByOwner(ownerId);
    expect(last).toEqual(t2);
  });

  it('findLastStartedAtByOwner is scoped per owner', async () => {
    const ownerA = '550e8400-e29b-41d4-a716-446655440010';
    const ownerB = '550e8400-e29b-41d4-a716-446655440011';
    const simA = Simulation.create({
      id: SimulationId.create('aaaaaaaa-bbbb-4ccc-8ddd-000000000003'),
      ownerId: ownerA,
      name: SimulationName.create('Owner A Sim'),
      matches: PRESET_MATCHES,
      profileId: 'uniform-realtime',
      now: new Date('2026-04-19T12:00:00Z'),
    });
    await repo.save(simA);
    const lastForB = await repo.findLastStartedAtByOwner(ownerB);
    expect(lastForB).toBeNull();
  });

  it('delete removes the row, no-op for unknown id', async () => {
    const sim = makeSim('d');
    await repo.save(sim);
    await repo.delete(sim.id);
    expect(await repo.findById(sim.id)).toBeNull();
    await expect(repo.delete(sim.id)).resolves.toBeUndefined();
  });
});
