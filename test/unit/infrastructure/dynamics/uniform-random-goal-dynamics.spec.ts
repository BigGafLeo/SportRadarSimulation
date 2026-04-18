import { UniformRandomGoalDynamics } from '@simulation/infrastructure/dynamics/uniform-random-goal-dynamics';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES, PRESET_TEAMS } from '@simulation/domain/value-objects/matches-preset';
import { GoalScored } from '@simulation/domain/events/goal-scored';

const CORE_CONFIG = { durationMs: 9000 };
const DEFAULT_CONFIG = { goalCount: 9, goalIntervalMs: 1000, firstGoalOffsetMs: 1000 };

function makeSim(): Simulation {
  const sim = Simulation.create({
    id: SimulationId.create('550e8400-e29b-41d4-a716-446655440000'),
    ownerToken: OwnershipToken.create('550e8400-e29b-41d4-a716-446655440010'),
    name: SimulationName.create('Katar 2023'),
    matches: PRESET_MATCHES,
    profileId: 'default',
    now: new Date(0),
  });
  sim.pullEvents();
  return sim;
}

describe('UniformRandomGoalDynamics', () => {
  it('returns TimedEvent with firstGoalOffsetMs for tickIndex 0', async () => {
    const dyn = new UniformRandomGoalDynamics(
      new SeededRandomProvider(42),
      CORE_CONFIG,
      DEFAULT_CONFIG,
    );
    const step = await dyn.nextStep(makeSim(), 0);
    expect(step).toBeDefined();
    expect(step!.delayMs).toBe(DEFAULT_CONFIG.firstGoalOffsetMs);
  });

  it('returns goalIntervalMs for tickIndex > 0', async () => {
    const dyn = new UniformRandomGoalDynamics(
      new SeededRandomProvider(42),
      CORE_CONFIG,
      DEFAULT_CONFIG,
    );
    const step = await dyn.nextStep(makeSim(), 5);
    expect(step!.delayMs).toBe(DEFAULT_CONFIG.goalIntervalMs);
  });

  it('returns undefined once tickIndex reaches goalCount (natural end)', async () => {
    const dyn = new UniformRandomGoalDynamics(
      new SeededRandomProvider(42),
      CORE_CONFIG,
      DEFAULT_CONFIG,
    );
    const step = await dyn.nextStep(makeSim(), DEFAULT_CONFIG.goalCount);
    expect(step).toBeUndefined();
  });

  it('event is GoalScored with teamId from PRESET_TEAMS', async () => {
    const dyn = new UniformRandomGoalDynamics(
      new SeededRandomProvider(42),
      CORE_CONFIG,
      DEFAULT_CONFIG,
    );
    const step = await dyn.nextStep(makeSim(), 0);
    expect(step!.event).toBeInstanceOf(GoalScored);
    const e = step!.event as GoalScored;
    const validTeamIds = PRESET_TEAMS.map((t) => t.id.value);
    expect(validTeamIds).toContain(e.teamId.value);
  });

  it('with fixed seed, produces deterministic sequence of teamIds', async () => {
    const dynA = new UniformRandomGoalDynamics(
      new SeededRandomProvider(7),
      CORE_CONFIG,
      DEFAULT_CONFIG,
    );
    const dynB = new UniformRandomGoalDynamics(
      new SeededRandomProvider(7),
      CORE_CONFIG,
      DEFAULT_CONFIG,
    );
    const sim = makeSim();
    const seqA: string[] = [];
    const seqB: string[] = [];
    for (let i = 0; i < 9; i++) {
      const a = await dynA.nextStep(sim, i);
      const b = await dynB.nextStep(sim, i);
      seqA.push((a!.event as GoalScored).teamId.value);
      seqB.push((b!.event as GoalScored).teamId.value);
    }
    expect(seqA).toEqual(seqB);
  });

  it('distributes across all 6 PRESET_TEAMS over many samples', async () => {
    const dyn = new UniformRandomGoalDynamics(
      new SeededRandomProvider(99),
      CORE_CONFIG,
      DEFAULT_CONFIG,
    );
    const sim = makeSim();
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const step = await dyn.nextStep(sim, i % DEFAULT_CONFIG.goalCount);
      if (step) seen.add((step.event as GoalScored).teamId.value);
    }
    expect(seen.size).toBe(PRESET_TEAMS.length);
  });

  it('goalCount=0 → returns undefined on tick 0', async () => {
    const zeroConfig = {
      goalCount: 0,
      goalIntervalMs: 1000,
      firstGoalOffsetMs: 1000,
      durationMs: 9000,
      startCooldownMs: 5000,
    };
    const dyn = new UniformRandomGoalDynamics(new SeededRandomProvider(42), zeroConfig);
    const step = await dyn.nextStep(makeSim(), 0);
    expect(step).toBeUndefined();
  });

  it('goalCount=1 → returns one TimedEvent on tick 0, then undefined on tick 1', async () => {
    const oneConfig = {
      goalCount: 1,
      goalIntervalMs: 1000,
      firstGoalOffsetMs: 500,
      durationMs: 9000,
      startCooldownMs: 5000,
    };
    const dyn = new UniformRandomGoalDynamics(new SeededRandomProvider(42), oneConfig);
    const sim = makeSim();
    const step0 = await dyn.nextStep(sim, 0);
    expect(step0).toBeDefined();
    expect(step0!.delayMs).toBe(500);
    expect(step0!.event).toBeInstanceOf(GoalScored);
    const step1 = await dyn.nextStep(sim, 1);
    expect(step1).toBeUndefined();
  });
});
