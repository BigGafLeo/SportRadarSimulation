import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';
import { TickingSimulationEngine } from '@simulation/infrastructure/engine/ticking-simulation-engine';
import { UniformRandomGoalDynamics } from '@simulation/infrastructure/dynamics/uniform-random-goal-dynamics';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { InMemorySimulationRepository } from '@simulation/infrastructure/persistence/in-memory-simulation.repository';
import { InMemoryCommandBus } from '@shared/messaging/in-memory-command-bus';
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import { InMemoryEventPublisher } from '@shared/messaging/in-memory-event-publisher';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import { runSimulationCommand } from '@simulation/application/commands/run-simulation.command';
import { abortSimulationCommand } from '@simulation/application/commands/abort-simulation.command';
import { SIMULATION_TOPICS } from '@simulation/application/commands/simulation-topics';
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import { SimulationFinished } from '@simulation/domain/events/simulation-finished';

const DYNAMICS_CONFIG = { goalCount: 9, goalIntervalMs: 1000, firstGoalOffsetMs: 1000 };

async function tickTo(clock: FakeClock, totalMs: number): Promise<void> {
  for (let elapsed = 0; elapsed < totalMs; elapsed += 1) {
    await clock.advance(1);
  }
}

describe('SimulationWorkerHandler', () => {
  async function buildRunningSim(
    simRepo: InMemorySimulationRepository,
    clock: FakeClock,
  ): Promise<{ id: SimulationId; token: OwnershipToken }> {
    const id = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
    const token = OwnershipToken.create('550e8400-e29b-41d4-a716-446655440010');
    const sim = Simulation.create({
      id,
      ownerToken: token,
      name: SimulationName.create('Katar 2023'),
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: clock.now(),
    });
    sim.pullEvents();
    await simRepo.save(sim);
    return { id, token };
  }

  it('runs engine to completion on RunSimulationCommand, emits 9 goals + auto-finish', async () => {
    const clock = new FakeClock(new Date(0));
    const simRepo = new InMemorySimulationRepository();
    const cmdBus = new InMemoryCommandBus();
    const eventBus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(eventBus);
    const engine = new TickingSimulationEngine(
      clock,
      new UniformRandomGoalDynamics(new SeededRandomProvider(42), DYNAMICS_CONFIG),
    );
    const handler = new SimulationWorkerHandler({
      simulationRepository: simRepo,
      commandBus: cmdBus,
      eventPublisher: publisher,
      engine,
      clock,
      profileId: 'default',
    });
    handler.subscribe();

    const observed: DomainEvent[] = [];
    eventBus.subscribe(
      () => true,
      async (e) => {
        observed.push(e);
      },
    );

    const { id } = await buildRunningSim(simRepo, clock);

    await cmdBus.dispatch(
      SIMULATION_TOPICS.RUN('default'),
      runSimulationCommand(id.value, 'default'),
    );
    await tickTo(clock, 10_000);
    await handler.drainInFlight();

    const goals = observed.filter((e) => e.type === 'GoalScored');
    const finishes = observed.filter((e) => e.type === 'SimulationFinished');
    expect(goals).toHaveLength(9);
    expect(finishes).toHaveLength(1);
    if (finishes[0] instanceof SimulationFinished) {
      expect(finishes[0].reason).toBe('auto');
    }
  });

  it('abort mid-run finishes with reason=manual, emits SimulationFinished', async () => {
    const clock = new FakeClock(new Date(0));
    const simRepo = new InMemorySimulationRepository();
    const cmdBus = new InMemoryCommandBus();
    const eventBus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(eventBus);
    const engine = new TickingSimulationEngine(
      clock,
      new UniformRandomGoalDynamics(new SeededRandomProvider(42), DYNAMICS_CONFIG),
    );
    const handler = new SimulationWorkerHandler({
      simulationRepository: simRepo,
      commandBus: cmdBus,
      eventPublisher: publisher,
      engine,
      clock,
      profileId: 'default',
    });
    handler.subscribe();

    const observed: DomainEvent[] = [];
    eventBus.subscribe(
      () => true,
      async (e) => {
        observed.push(e);
      },
    );

    const { id } = await buildRunningSim(simRepo, clock);
    await cmdBus.dispatch(
      SIMULATION_TOPICS.RUN('default'),
      runSimulationCommand(id.value, 'default'),
    );

    await tickTo(clock, 3000);
    await cmdBus.dispatch(
      SIMULATION_TOPICS.ABORT,
      abortSimulationCommand(id.value, clock.now().getTime()),
    );
    await handler.drainInFlight();

    const goals = observed.filter((e) => e.type === 'GoalScored');
    const finishes = observed.filter((e) => e.type === 'SimulationFinished');
    expect(goals.length).toBeLessThan(9);
    expect(finishes).toHaveLength(1);
    if (finishes[0] instanceof SimulationFinished) {
      expect(finishes[0].reason).toBe('manual');
    }
  });

  it('abort for unknown simulationId is a no-op (ignored silently)', async () => {
    const clock = new FakeClock(new Date(0));
    const simRepo = new InMemorySimulationRepository();
    const cmdBus = new InMemoryCommandBus();
    const publisher = new InMemoryEventPublisher(new InMemoryEventBus());
    const engine = new TickingSimulationEngine(
      clock,
      new UniformRandomGoalDynamics(new SeededRandomProvider(42), DYNAMICS_CONFIG),
    );
    const handler = new SimulationWorkerHandler({
      simulationRepository: simRepo,
      commandBus: cmdBus,
      eventPublisher: publisher,
      engine,
      clock,
      profileId: 'default',
    });
    handler.subscribe();

    await expect(
      cmdBus.dispatch(
        SIMULATION_TOPICS.ABORT,
        abortSimulationCommand('550e8400-e29b-41d4-a716-446655440000', 0),
      ),
    ).resolves.toBeUndefined();
  });

  it('shutdown() aborts in-flight runs and detaches subscriptions', async () => {
    const clock = new FakeClock(new Date(0));
    const simRepo = new InMemorySimulationRepository();
    const cmdBus = new InMemoryCommandBus();
    const eventBus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(eventBus);
    const engine = new TickingSimulationEngine(
      clock,
      new UniformRandomGoalDynamics(new SeededRandomProvider(42), DYNAMICS_CONFIG),
    );
    const handler = new SimulationWorkerHandler({
      simulationRepository: simRepo,
      commandBus: cmdBus,
      eventPublisher: publisher,
      engine,
      clock,
      profileId: 'default',
    });
    handler.subscribe();

    const { id } = await buildRunningSim(simRepo, clock);
    await cmdBus.dispatch(
      SIMULATION_TOPICS.RUN('default'),
      runSimulationCommand(id.value, 'default'),
    );
    await tickTo(clock, 2000);

    await handler.shutdown();

    const { id: id2 } = await buildRunningSim(simRepo, clock);
    await cmdBus.dispatch(
      SIMULATION_TOPICS.RUN('default'),
      runSimulationCommand(id2.value, 'default'),
    );
    const snap = (await simRepo.findById(id2))!.toSnapshot();
    expect(snap.totalGoals).toBe(0);
  });
});
