import { PoissonGoalDynamics } from '@simulation/infrastructure/dynamics/poisson-goal-dynamics';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES, PRESET_TEAMS } from '@simulation/domain/value-objects/matches-preset';
import { GoalScored } from '@simulation/domain/events/goal-scored';

function makeSim(idSuffix = '0'): Simulation {
  const id = `aaaaaaaa-bbbb-4ccc-8ddd-${idSuffix.padStart(12, '0')}`;
  const sim = Simulation.create({
    id: SimulationId.create(id),
    ownerToken: OwnershipToken.create('550e8400-e29b-41d4-a716-446655440010'),
    name: SimulationName.create('Test Match'),
    matches: PRESET_MATCHES,
    profileId: 'poisson-accelerated',
    now: new Date(0),
  });
  sim.pullEvents();
  return sim;
}

describe('PoissonGoalDynamics', () => {
  it('returns undefined when virtual time exhausts durationMs', async () => {
    const dyn = new PoissonGoalDynamics(
      new SeededRandomProvider(1),
      { durationMs: 100 },
      { goalsPerTeamMean: 0.001 },
    );
    const sim = makeSim();
    let undefinedHits = 0;
    for (let tick = 0; tick < 50; tick++) {
      const r = await dyn.nextStep(sim, tick);
      if (!r) {
        undefinedHits++;
        break;
      }
    }
    expect(undefinedHits).toBe(1);
  });

  it('emits GoalScored intents with valid PRESET_TEAMS teamId', async () => {
    const dyn = new PoissonGoalDynamics(
      new SeededRandomProvider(42),
      { durationMs: 9000 },
      { goalsPerTeamMean: 5 },
    );
    const sim = makeSim();
    const validTeamIds = PRESET_TEAMS.map((t) => t.id.value);
    let goals = 0;
    for (let tick = 0; tick < 200; tick++) {
      const step = await dyn.nextStep(sim, tick);
      if (!step) break;
      expect(step.event).toBeInstanceOf(GoalScored);
      const intent = step.event as GoalScored;
      expect(validTeamIds).toContain(intent.teamId.value);
      expect(step.delayMs).toBeGreaterThanOrEqual(0);
      goals++;
    }
    expect(goals).toBeGreaterThan(0);
  });

  it('average goals across many runs near expected mean (statistical sanity)', async () => {
    const dyn = new PoissonGoalDynamics(
      new SeededRandomProvider(2026),
      { durationMs: 90 * 60 * 1000 },
      { goalsPerTeamMean: 2.7 },
    );
    let totalGoals = 0;
    const runs = 30;
    for (let r = 0; r < runs; r++) {
      const sim = makeSim(String(r));
      for (let tick = 0; tick < 500; tick++) {
        const step = await dyn.nextStep(sim, tick);
        if (!step) break;
        totalGoals++;
      }
    }
    const avgPerSim = totalGoals / runs;
    // Expected: mean per team * 6 teams = ~16.2 per simulation
    // Wide bounds to absorb Poisson variance
    expect(avgPerSim).toBeGreaterThan(10);
    expect(avgPerSim).toBeLessThan(24);
  });

  it('durationMs=0 → throws in constructor', () => {
    expect(
      () =>
        new PoissonGoalDynamics(
          new SeededRandomProvider(1),
          { durationMs: 0 },
          { goalsPerTeamMean: 2.7 },
        ),
    ).toThrow('durationMs must be positive');
  });

  it('durationMs negative → throws in constructor', () => {
    expect(
      () =>
        new PoissonGoalDynamics(
          new SeededRandomProvider(1),
          { durationMs: -1000 },
          { goalsPerTeamMean: 2.7 },
        ),
    ).toThrow('durationMs must be positive');
  });

  it('goalsPerTeamMean=0 → totalRatePerMs=0, nextAt=Infinity → returns undefined immediately', async () => {
    const dyn = new PoissonGoalDynamics(
      new SeededRandomProvider(1),
      { durationMs: 90_000 },
      { goalsPerTeamMean: 0 },
    );
    const sim = makeSim();
    const result = await dyn.nextStep(sim, 0);
    expect(result).toBeUndefined();
    // State is cleaned up
    expect(dyn.activeStateCount()).toBe(0);
  });

  it('onAbort for unknown simulationId → no-op (does not throw)', () => {
    const dyn = new PoissonGoalDynamics(
      new SeededRandomProvider(1),
      { durationMs: 90_000 },
      { goalsPerTeamMean: 2.7 },
    );
    expect(() => dyn.onAbort('non-existent-id')).not.toThrow();
    expect(dyn.activeStateCount()).toBe(0);
  });

  it('multiple onAbort calls for same id → idempotent', async () => {
    const dyn = new PoissonGoalDynamics(
      new SeededRandomProvider(42),
      { durationMs: 90_000 },
      { goalsPerTeamMean: 5 },
    );
    const sim = makeSim();
    // Seed some state
    await dyn.nextStep(sim, 0);
    expect(dyn.activeStateCount()).toBe(1);

    dyn.onAbort(sim.id.value);
    expect(dyn.activeStateCount()).toBe(0);

    // Second abort must not throw
    expect(() => dyn.onAbort(sim.id.value)).not.toThrow();
    expect(dyn.activeStateCount()).toBe(0);
  });

  it('cleans up state when match ends (no leak)', async () => {
    const dyn = new PoissonGoalDynamics(
      new SeededRandomProvider(7),
      { durationMs: 100 },
      { goalsPerTeamMean: 0.5 },
    );
    const sim = makeSim();
    for (let tick = 0; tick < 30; tick++) {
      if (!(await dyn.nextStep(sim, tick))) break;
    }
    expect(dyn.activeStateCount()).toBe(0);
  });
});
