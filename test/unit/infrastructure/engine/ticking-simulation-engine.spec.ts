import { TickingSimulationEngine } from '@simulation/infrastructure/engine/ticking-simulation-engine';
import { UniformRandomGoalDynamics } from '@simulation/infrastructure/dynamics/uniform-random-goal-dynamics';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import { GoalScored } from '@simulation/domain/events/goal-scored';
import { SimulationFinished } from '@simulation/domain/events/simulation-finished';

const CORE_CONFIG = { durationMs: 9000 };
const DYNAMICS_CONFIG = { goalCount: 9, goalIntervalMs: 1000, firstGoalOffsetMs: 1000 };

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

/**
 * Tick the fake clock forward one interval at a time, yielding after each step
 * so the engine loop can fully process the resolved sleep (call dynamics.nextStep,
 * dispatchIntent, emit events) before the clock advances to the next deadline.
 *
 * FakeClock.advance resolves all sleeps in deadline order with one microtask yield
 * between each — but the engine's async loop body has several awaits per step
 * (dynamics.nextStep + N emit calls). Stepping 1 ms at a time and awaiting a
 * queueMicrotask flush after each step gives the engine all the turns it needs.
 */
async function tickTo(clock: FakeClock, targetMs: number): Promise<void> {
  let elapsed = 0;
  while (elapsed < targetMs) {
    const step = Math.min(1, targetMs - elapsed);
    await clock.advance(step);
    // Yield to let the engine loop process the resolved sleep fully.
    await new Promise<void>((r) => setImmediate(r));
    elapsed += step;
  }
}

describe('TickingSimulationEngine', () => {
  it('runs dynamics to completion, emits 9 GoalScored + 1 SimulationFinished (auto)', async () => {
    const clock = new FakeClock(new Date(0));
    const dyn = new UniformRandomGoalDynamics(
      new SeededRandomProvider(42),
      CORE_CONFIG,
      DYNAMICS_CONFIG,
    );
    const engine = new TickingSimulationEngine(clock, dyn);
    const sim = makeSim();
    const emitted: DomainEvent[] = [];

    const runPromise = engine.run(
      sim,
      async (e) => {
        emitted.push(e);
      },
      new AbortController().signal,
    );
    await tickTo(clock, 10_000);
    await runPromise;

    const goalCount = emitted.filter((e) => e.type === 'GoalScored').length;
    const finishCount = emitted.filter((e) => e.type === 'SimulationFinished').length;
    expect(goalCount).toBe(9);
    expect(finishCount).toBe(1);

    const last = emitted[emitted.length - 1];
    expect(last.type).toBe('SimulationFinished');
    if (last instanceof SimulationFinished) {
      expect(last.reason).toBe('auto');
      expect(last.totalGoals).toBe(9);
    }
  }, 15_000);

  it('emitted GoalScored events carry post-increment totalGoals (1, 2, ..., 9)', async () => {
    const clock = new FakeClock(new Date(0));
    const dyn = new UniformRandomGoalDynamics(
      new SeededRandomProvider(42),
      CORE_CONFIG,
      DYNAMICS_CONFIG,
    );
    const engine = new TickingSimulationEngine(clock, dyn);
    const sim = makeSim();
    const goals: number[] = [];

    const runPromise = engine.run(
      sim,
      async (e) => {
        if (e instanceof GoalScored) goals.push(e.totalGoals);
      },
      new AbortController().signal,
    );
    await tickTo(clock, 10_000);
    await runPromise;

    expect(goals).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }, 15_000);

  it('aborts cleanly when signal fires mid-run (no finish emitted)', async () => {
    const clock = new FakeClock(new Date(0));
    const dyn = new UniformRandomGoalDynamics(
      new SeededRandomProvider(42),
      CORE_CONFIG,
      DYNAMICS_CONFIG,
    );
    const engine = new TickingSimulationEngine(clock, dyn);
    const sim = makeSim();
    const emitted: DomainEvent[] = [];
    const ctrl = new AbortController();

    const runPromise = engine.run(
      sim,
      async (e) => {
        emitted.push(e);
      },
      ctrl.signal,
    );
    // Tick to t=3001 so the 3rd goal sleep (resolves at t=3000) is unambiguously
    // processed before we abort. tickTo yields via setImmediate after each ms step,
    // giving the engine loop time to dispatch the intent and emit the event.
    await tickTo(clock, 3001);
    ctrl.abort();
    await expect(runPromise).resolves.toBeUndefined();

    const goalCount = emitted.filter((e) => e.type === 'GoalScored').length;
    const finishCount = emitted.filter((e) => e.type === 'SimulationFinished').length;
    expect(goalCount).toBe(3);
    expect(finishCount).toBe(0);
  });

  it('does not run at all if aborted before start', async () => {
    const clock = new FakeClock(new Date(0));
    const dyn = new UniformRandomGoalDynamics(
      new SeededRandomProvider(42),
      CORE_CONFIG,
      DYNAMICS_CONFIG,
    );
    const engine = new TickingSimulationEngine(clock, dyn);
    const sim = makeSim();
    const emitted: DomainEvent[] = [];
    const ctrl = new AbortController();
    ctrl.abort();

    await engine.run(
      sim,
      async (e) => {
        emitted.push(e);
      },
      ctrl.signal,
    );
    expect(emitted).toEqual([]);
  });

  it('dynamics returns undefined on tick 0 → engine finishes auto with totalGoals=0', async () => {
    const clock = new FakeClock(new Date(0));
    const zeroGoalConfig = {
      goalCount: 0,
      goalIntervalMs: 1000,
      firstGoalOffsetMs: 1000,
      durationMs: 9000,
      startCooldownMs: 5000,
    };
    const dyn = new UniformRandomGoalDynamics(new SeededRandomProvider(42), zeroGoalConfig);
    const engine = new TickingSimulationEngine(clock, dyn);
    const sim = makeSim();
    const emitted: DomainEvent[] = [];

    await engine.run(
      sim,
      async (e) => {
        emitted.push(e);
      },
      new AbortController().signal,
    );

    const finishEvents = emitted.filter((e) => e.type === 'SimulationFinished');
    expect(finishEvents).toHaveLength(1);
    const last = finishEvents[0];
    if (last instanceof SimulationFinished) {
      expect(last.reason).toBe('auto');
      expect(last.totalGoals).toBe(0);
    }
    expect(emitted.filter((e) => e.type === 'GoalScored')).toHaveLength(0);
  });
});
