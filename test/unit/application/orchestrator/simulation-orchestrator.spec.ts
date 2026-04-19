import { SimulationOrchestrator } from '@simulation/application/orchestrator/simulation-orchestrator';
import {
  SimulationNotFoundError,
  OwnershipMismatchError,
  ThrottledError,
} from '@simulation/application/orchestrator/orchestrator.errors';
import { InMemorySimulationRepository } from '@simulation/infrastructure/persistence/in-memory-simulation.repository';
import { InMemoryCommandBus } from '@shared/messaging/in-memory-command-bus';
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import { InMemoryEventPublisher } from '@shared/messaging/in-memory-event-publisher';
import { FiveSecondCooldownPolicy } from '@simulation/infrastructure/policies/five-second-cooldown.policy';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { InvalidStateError } from '@simulation/domain/errors/invalid-state.error';
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import {
  RUN_COMMAND_TYPE,
  ABORT_COMMAND_TYPE,
  SIMULATION_TOPICS,
} from '@simulation/application/commands/simulation-topics';

const COOLDOWN_MS = 5000;
const USER_A = 'user-a-uuid';
const USER_B = 'user-b-uuid';

function buildWiring() {
  const clock = new FakeClock(new Date('2026-04-18T12:00:00Z'));
  const simRepo = new InMemorySimulationRepository();
  const cmdBus = new InMemoryCommandBus();
  const eventBus = new InMemoryEventBus();
  const publisher = new InMemoryEventPublisher(eventBus);
  const throttle = new FiveSecondCooldownPolicy(COOLDOWN_MS);

  const orchestrator = new SimulationOrchestrator({
    simulationRepository: simRepo,
    throttlePolicy: throttle,
    commandBus: cmdBus,
    eventPublisher: publisher,
    clock,
    cooldownMs: COOLDOWN_MS,
    defaultProfileId: 'default',
  });

  return { clock, simRepo, cmdBus, eventBus, publisher, orchestrator };
}

describe('SimulationOrchestrator', () => {
  describe('startSimulation', () => {
    it('creates simulation with userId, returns simulationId + state + snapshot (no ownershipToken)', async () => {
      const w = buildWiring();
      const result = await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      expect(result.simulationId).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.state).toBe('RUNNING');
      expect(result.initialSnapshot).toBeDefined();
      expect(result.initialSnapshot.ownerId).toBe(USER_A);
      expect('ownershipToken' in result).toBe(false);

      const saved = await w.simRepo.findById(SimulationId.create(result.simulationId));
      expect(saved).not.toBeNull();
      expect(saved!.toSnapshot().name).toBe('Katar 2023');
    });

    it('uses default profile when none provided', async () => {
      const w = buildWiring();
      const result = await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      expect(result.initialSnapshot.profileId).toBe('default');
    });

    it('uses provided profileId when specified', async () => {
      const w = buildWiring();
      const result = await w.orchestrator.startSimulation({
        userId: USER_A,
        name: 'Katar 2023',
        profileId: 'poisson',
      });
      expect(result.initialSnapshot.profileId).toBe('poisson');
    });

    it('dispatches RunSimulationCommand via CommandBus', async () => {
      const w = buildWiring();
      const dispatched: unknown[] = [];
      w.cmdBus.subscribe(SIMULATION_TOPICS.RUN('default'), async (cmd) => {
        dispatched.push(cmd);
      });
      const result = await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      expect(dispatched).toHaveLength(1);
      const cmd = dispatched[0] as { type: string; simulationId: string };
      expect(cmd.type).toBe(RUN_COMMAND_TYPE);
      expect(cmd.simulationId).toBe(result.simulationId);
    });

    it('publishes SimulationStarted event on EventBus', async () => {
      const w = buildWiring();
      const events: DomainEvent[] = [];
      w.eventBus.subscribe(
        () => true,
        async (e) => {
          events.push(e);
        },
      );
      await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      expect(events.some((e) => e.type === 'SimulationStarted')).toBe(true);
    });
  });

  describe('finishSimulation', () => {
    it('dispatches AbortSimulationCommand for own simulation', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      const aborts: unknown[] = [];
      w.cmdBus.subscribe(SIMULATION_TOPICS.ABORT, async (cmd) => {
        aborts.push(cmd);
      });
      await w.orchestrator.finishSimulation({
        simulationId: SimulationId.create(started.simulationId),
        userId: USER_A,
      });
      expect(aborts).toHaveLength(1);
      const cmd = aborts[0] as { type: string; simulationId: string };
      expect(cmd.type).toBe(ABORT_COMMAND_TYPE);
      expect(cmd.simulationId).toBe(started.simulationId);
    });

    it('throws OwnershipMismatchError when userId differs', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      await expect(
        w.orchestrator.finishSimulation({
          simulationId: SimulationId.create(started.simulationId),
          userId: USER_B,
        }),
      ).rejects.toThrow(OwnershipMismatchError);
    });

    it('throws SimulationNotFoundError for unknown simulationId', async () => {
      const w = buildWiring();
      await expect(
        w.orchestrator.finishSimulation({
          simulationId: SimulationId.create('550e8400-e29b-41d4-a716-000000000000'),
          userId: USER_A,
        }),
      ).rejects.toThrow(SimulationNotFoundError);
    });
  });

  describe('restartSimulation', () => {
    it('restarts finished simulation for owner', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      const sim = (await w.simRepo.findById(SimulationId.create(started.simulationId)))!;
      sim.finish('auto', w.clock.now());
      await w.simRepo.save(sim);
      sim.pullEvents();

      await w.clock.advance(6000);

      const runs: unknown[] = [];
      w.cmdBus.subscribe(SIMULATION_TOPICS.RUN('default'), async (cmd) => {
        runs.push(cmd);
      });
      await w.orchestrator.restartSimulation({
        simulationId: SimulationId.create(started.simulationId),
        userId: USER_A,
      });
      const after = (await w.simRepo.findById(
        SimulationId.create(started.simulationId),
      ))!.toSnapshot();
      expect(after.state).toBe('RUNNING');
      expect(after.totalGoals).toBe(0);
      expect(runs).toHaveLength(1);
    });

    it('throws OwnershipMismatchError for non-owner', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      const sim = (await w.simRepo.findById(SimulationId.create(started.simulationId)))!;
      sim.finish('auto', w.clock.now());
      await w.simRepo.save(sim);
      sim.pullEvents();

      await w.clock.advance(6000);
      await expect(
        w.orchestrator.restartSimulation({
          simulationId: SimulationId.create(started.simulationId),
          userId: USER_B,
        }),
      ).rejects.toThrow(OwnershipMismatchError);
    });

    it('throws InvalidStateError when simulation is RUNNING', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      await expect(
        w.orchestrator.restartSimulation({
          simulationId: SimulationId.create(started.simulationId),
          userId: USER_A,
        }),
      ).rejects.toThrow(InvalidStateError);
    });
  });

  describe('listSimulations', () => {
    it('returns all snapshots', async () => {
      const w = buildWiring();
      const a = await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      await w.clock.advance(6000);
      const b = await w.orchestrator.startSimulation({ userId: USER_B, name: 'Paryz 2024' });
      const list = await w.orchestrator.listSimulations();
      expect(list.map((s) => s.id).sort()).toEqual([a.simulationId, b.simulationId].sort());
    });
  });

  describe('getSimulation', () => {
    it('returns snapshot by id', async () => {
      const w = buildWiring();
      const a = await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      const snap = await w.orchestrator.getSimulation(SimulationId.create(a.simulationId));
      expect(snap.id).toBe(a.simulationId);
      expect(snap.name).toBe('Katar 2023');
    });

    it('throws SimulationNotFoundError for unknown id', async () => {
      const w = buildWiring();
      await expect(
        w.orchestrator.getSimulation(SimulationId.create('550e8400-e29b-41d4-a716-111111111111')),
      ).rejects.toThrow(SimulationNotFoundError);
    });
  });

  describe('throttle', () => {
    it('throws ThrottledError on second start within cooldown for same userId', async () => {
      const w = buildWiring();
      await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      await w.clock.advance(3000);
      await expect(
        w.orchestrator.startSimulation({ userId: USER_A, name: 'Paryz 2024' }),
      ).rejects.toThrow(ThrottledError);
    });

    it('allows two different userIds to start within the same cooldown window', async () => {
      const w = buildWiring();
      const a = await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      const b = await w.orchestrator.startSimulation({ userId: USER_B, name: 'Paryz 2024' });
      expect(a.simulationId).not.toBe(b.simulationId);
    });

    it('allows restart after cooldown elapses', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ userId: USER_A, name: 'Katar 2023' });
      const sim = (await w.simRepo.findById(SimulationId.create(started.simulationId)))!;
      sim.finish('manual', w.clock.now());
      await w.simRepo.save(sim);
      sim.pullEvents();
      await w.clock.advance(2000);
      await expect(
        w.orchestrator.restartSimulation({
          simulationId: SimulationId.create(started.simulationId),
          userId: USER_A,
        }),
      ).rejects.toThrow(ThrottledError);
    });
  });
});
