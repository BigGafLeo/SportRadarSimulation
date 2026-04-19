import { TickingSimulationEngine } from '@simulation/infrastructure/engine/ticking-simulation-engine';
import { UniformRandomGoalDynamics } from '@simulation/infrastructure/dynamics/uniform-random-goal-dynamics';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import { InMemoryEventPublisher } from '@shared/messaging/in-memory-event-publisher';
import { InMemorySimulationRepository } from '@simulation/infrastructure/persistence/in-memory-simulation.repository';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import type { DomainEvent } from '@simulation/domain/events/domain-event';

const DYNAMICS_CONFIG = { goalCount: 9, goalIntervalMs: 1000, firstGoalOffsetMs: 1000 };

/** Advance FakeClock in small chunks so multi-await engine loop can chain. */
async function tickTo(clock: FakeClock, totalMs: number): Promise<void> {
  const chunk = 1;
  for (let elapsed = 0; elapsed < totalMs; elapsed += chunk) {
    await clock.advance(chunk);
  }
}

describe('Simulation engine — end-to-end (in-process, FakeClock)', () => {
  it('runs full 9-goal simulation in <100ms wall-clock via FakeClock', async () => {
    const clock = new FakeClock(new Date('2026-04-18T12:00:00Z'));
    const rng = new SeededRandomProvider(42);
    const dynamics = new UniformRandomGoalDynamics(rng, DYNAMICS_CONFIG);
    const engine = new TickingSimulationEngine(clock, dynamics);
    const repo = new InMemorySimulationRepository();
    const bus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(bus);

    const sim = Simulation.create({
      id: SimulationId.create('550e8400-e29b-41d4-a716-446655440000'),
      ownerToken: OwnershipToken.create('550e8400-e29b-41d4-a716-446655440010'),
      name: SimulationName.create('Katar 2023'),
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: clock.now(),
    });
    // Drain SimulationStarted event and publish it too
    for (const e of sim.pullEvents()) await publisher.publish(e);
    await repo.save(sim);

    const observed: DomainEvent[] = [];
    bus.subscribe(
      () => true,
      async (e) => {
        observed.push(e);
      },
    );

    const wallStart = Date.now();

    const runPromise = engine.run(
      sim,
      async (e) => {
        await publisher.publish(e);
        await repo.save(sim);
      },
      new AbortController().signal,
    );
    await tickTo(clock, 10_000);
    await runPromise;

    const wallElapsed = Date.now() - wallStart;
    expect(wallElapsed).toBeLessThan(500); // generous; typical <100ms

    // Event stream shape: 9 GoalScored, then SimulationFinished(auto)
    const goals = observed.filter((e) => e.type === 'GoalScored');
    const finishes = observed.filter((e) => e.type === 'SimulationFinished');
    expect(goals).toHaveLength(9);
    expect(finishes).toHaveLength(1);

    // Final state in repo
    const saved = await repo.findById(SimulationId.create('550e8400-e29b-41d4-a716-446655440000'));
    expect(saved).not.toBeNull();
    const snap = saved!.toSnapshot();
    expect(snap.state).toBe('FINISHED');
    expect(snap.totalGoals).toBe(9);
  });
});
