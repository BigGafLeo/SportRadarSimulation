import { FastMarkovDynamics } from '@simulation/infrastructure/dynamics/fast-markov-dynamics';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { PRESET_MATCHES, PRESET_TEAMS } from '@simulation/domain/value-objects/matches-preset';
import { GoalScored } from '@simulation/domain/events/goal-scored';

function makeSim(idSuffix = '0'): Simulation {
  const id = `aaaaaaaa-bbbb-4ccc-8ddd-${idSuffix.padStart(12, '0')}`;
  const sim = Simulation.create({
    id: SimulationId.create(id),
    ownerId: 'user-uuid-dynamics-test',
    name: SimulationName.create('Test Match'),
    matches: PRESET_MATCHES,
    profileId: 'fast-markov',
    now: new Date(0),
  });
  sim.pullEvents();
  return sim;
}

describe('FastMarkovDynamics', () => {
  it('emits GoalScored intents with valid PRESET_TEAMS teamId', async () => {
    const dyn = new FastMarkovDynamics(
      new SeededRandomProvider(11),
      { durationMs: 30_000 },
      { stepMs: 100 },
    );
    const sim = makeSim();
    const validTeamIds = PRESET_TEAMS.map((t) => t.id.value);
    let goals = 0;
    for (let tick = 0; tick < 1000; tick++) {
      const step = await dyn.nextStep(sim, tick);
      if (!step) break;
      expect(step.event).toBeInstanceOf(GoalScored);
      expect(validTeamIds).toContain((step.event as GoalScored).teamId.value);
      goals++;
    }
    expect(goals).toBeGreaterThan(0);
  });

  it('respects durationMs — totalDelay does not exceed it', async () => {
    const dyn = new FastMarkovDynamics(
      new SeededRandomProvider(3),
      { durationMs: 1000 },
      { stepMs: 100 },
    );
    const sim = makeSim();
    let totalDelay = 0;
    for (let tick = 0; tick < 100; tick++) {
      const step = await dyn.nextStep(sim, tick);
      if (!step) break;
      totalDelay += step.delayMs;
    }
    expect(totalDelay).toBeLessThanOrEqual(1000);
  });

  it('returns delayMs equal to stepMs (single goal-transition step)', async () => {
    const dyn = new FastMarkovDynamics(
      new SeededRandomProvider(99),
      { durationMs: 60_000 },
      { stepMs: 50 },
    );
    const sim = makeSim();
    const step = await dyn.nextStep(sim, 0);
    if (step) expect(step.delayMs).toBe(50);
  });

  it('cleans up state when match ends', async () => {
    const dyn = new FastMarkovDynamics(
      new SeededRandomProvider(5),
      { durationMs: 200 },
      { stepMs: 100 },
    );
    const sim = makeSim();
    for (let tick = 0; tick < 20; tick++) {
      if (!(await dyn.nextStep(sim, tick))) break;
    }
    expect(dyn.activeStateCount()).toBe(0);
  });

  it('stepMs=0 → throws in constructor', () => {
    expect(
      () =>
        new FastMarkovDynamics(new SeededRandomProvider(1), { durationMs: 5000 }, { stepMs: 0 }),
    ).toThrow('stepMs must be positive');
  });

  it('stepMs negative → throws in constructor', () => {
    expect(
      () =>
        new FastMarkovDynamics(new SeededRandomProvider(1), { durationMs: 5000 }, { stepMs: -1 }),
    ).toThrow('stepMs must be positive');
  });

  it('durationMs=0 → returns undefined immediately (no steps possible)', async () => {
    const dyn = new FastMarkovDynamics(
      new SeededRandomProvider(1),
      { durationMs: 0 },
      { stepMs: 100 },
    );
    const sim = makeSim();
    const result = await dyn.nextStep(sim, 0);
    expect(result).toBeUndefined();
  });

  it('stepMs > durationMs → returns undefined immediately (cannot take one step)', async () => {
    const dyn = new FastMarkovDynamics(
      new SeededRandomProvider(1),
      { durationMs: 50 },
      { stepMs: 100 },
    );
    const sim = makeSim();
    const result = await dyn.nextStep(sim, 0);
    expect(result).toBeUndefined();
  });

  it('onAbort for unknown simulationId → no-op (does not throw)', () => {
    const dyn = new FastMarkovDynamics(
      new SeededRandomProvider(1),
      { durationMs: 5000 },
      { stepMs: 100 },
    );
    expect(() => dyn.onAbort('non-existent-id')).not.toThrow();
    expect(dyn.activeStateCount()).toBe(0);
  });

  it('multiple onAbort calls for same id → idempotent', async () => {
    const dyn = new FastMarkovDynamics(
      new SeededRandomProvider(1),
      { durationMs: 5000 },
      { stepMs: 100 },
    );
    const sim = makeSim();
    // Seed some state
    await dyn.nextStep(sim, 0);
    expect(dyn.activeStateCount()).toBe(1);

    dyn.onAbort(sim.id.value);
    expect(dyn.activeStateCount()).toBe(0);

    // Second abort on same id must not throw
    expect(() => dyn.onAbort(sim.id.value)).not.toThrow();
    expect(dyn.activeStateCount()).toBe(0);
  });

  it('deterministic with same seed', async () => {
    const dynA = new FastMarkovDynamics(
      new SeededRandomProvider(7),
      { durationMs: 5000 },
      { stepMs: 100 },
    );
    const dynB = new FastMarkovDynamics(
      new SeededRandomProvider(7),
      { durationMs: 5000 },
      { stepMs: 100 },
    );
    const seqA: string[] = [];
    const seqB: string[] = [];
    for (let tick = 0; tick < 10; tick++) {
      const a = await dynA.nextStep(makeSim('A'), tick);
      const b = await dynB.nextStep(makeSim('A'), tick);
      if (!a || !b) break;
      seqA.push((a.event as GoalScored).teamId.value);
      seqB.push((b.event as GoalScored).teamId.value);
    }
    expect(seqA).toEqual(seqB);
  });
});
