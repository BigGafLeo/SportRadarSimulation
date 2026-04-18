import { SimulationOrchestrator } from '@simulation/application/orchestrator/simulation-orchestrator';
import {
  SimulationNotFoundError,
  OwnershipMismatchError,
  ThrottledError,
  UnknownTokenError,
} from '@simulation/application/orchestrator/orchestrator.errors';
import { InMemorySimulationRepository } from '@simulation/infrastructure/persistence/in-memory-simulation.repository';
import { InMemoryOwnershipRepository } from '@ownership/infrastructure/in-memory-ownership.repository';
import { InMemoryCommandBus } from '@shared/messaging/in-memory-command-bus';
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import { InMemoryEventPublisher } from '@shared/messaging/in-memory-event-publisher';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { UuidOwnershipTokenGenerator } from '@ownership/infrastructure/uuid-ownership-token.generator';
import { FiveSecondCooldownPolicy } from '@simulation/infrastructure/policies/five-second-cooldown.policy';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import {
  RUN_COMMAND_TYPE,
  ABORT_COMMAND_TYPE,
  SIMULATION_TOPICS,
} from '@simulation/application/commands/simulation-topics';

const COOLDOWN_MS = 5000;

function buildWiring() {
  const clock = new FakeClock(new Date('2026-04-18T12:00:00Z'));
  const rng = new SeededRandomProvider(42);
  const simRepo = new InMemorySimulationRepository();
  const ownerRepo = new InMemoryOwnershipRepository();
  const cmdBus = new InMemoryCommandBus();
  const eventBus = new InMemoryEventBus();
  const publisher = new InMemoryEventPublisher(eventBus);
  const tokenGen = new UuidOwnershipTokenGenerator(rng);
  const throttle = new FiveSecondCooldownPolicy(COOLDOWN_MS);

  const orchestrator = new SimulationOrchestrator({
    simulationRepository: simRepo,
    ownershipRepository: ownerRepo,
    tokenGenerator: tokenGen,
    throttlePolicy: throttle,
    commandBus: cmdBus,
    eventPublisher: publisher,
    clock,
    cooldownMs: COOLDOWN_MS,
    defaultProfileId: 'default',
  });

  return { clock, rng, simRepo, ownerRepo, cmdBus, eventBus, publisher, orchestrator };
}

describe('SimulationOrchestrator', () => {
  describe('startSimulation', () => {
    it('creates simulation with new token when no token provided', async () => {
      const w = buildWiring();
      const result = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      expect(result.simulationId).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.ownershipToken).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.state).toBe('RUNNING');

      const saved = await w.simRepo.findById(SimulationId.create(result.simulationId));
      expect(saved).not.toBeNull();
      expect(saved!.toSnapshot().name).toBe('Katar 2023');
    });

    it('reuses existing token when provided', async () => {
      const w = buildWiring();
      const first = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      await w.clock.advance(6000);
      const second = await w.orchestrator.startSimulation({
        name: 'Paryz 2024',
        ownershipToken: OwnershipToken.create(first.ownershipToken),
      });
      expect(second.ownershipToken).toBe(first.ownershipToken);
      expect(second.simulationId).not.toBe(first.simulationId);
    });

    it('rejects unknown token', async () => {
      const w = buildWiring();
      await expect(
        w.orchestrator.startSimulation({
          name: 'Katar 2023',
          ownershipToken: OwnershipToken.create('550e8400-e29b-41d4-a716-999999999999'),
        }),
      ).rejects.toThrow(UnknownTokenError);
    });

    it('rejects when throttle cooldown not elapsed', async () => {
      const w = buildWiring();
      const first = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      await w.clock.advance(3000);
      await expect(
        w.orchestrator.startSimulation({
          name: 'Paryz 2024',
          ownershipToken: OwnershipToken.create(first.ownershipToken),
        }),
      ).rejects.toThrow(ThrottledError);
    });

    it('dispatches RunSimulationCommand via CommandBus', async () => {
      const w = buildWiring();
      const dispatched: unknown[] = [];
      w.cmdBus.subscribe(SIMULATION_TOPICS.RUN('default'), async (cmd) => {
        dispatched.push(cmd);
      });
      const result = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
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
      await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      expect(events.some((e) => e.type === 'SimulationStarted')).toBe(true);
    });

    it('updates lastIgnitionAt on ownership record', async () => {
      const w = buildWiring();
      const result = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      const rec = await w.ownerRepo.findByToken(OwnershipToken.create(result.ownershipToken));
      expect(rec?.lastIgnitionAt).toEqual(w.clock.now());
    });
  });

  describe('finishSimulation', () => {
    it('dispatches AbortSimulationCommand when caller is owner', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      const aborts: unknown[] = [];
      w.cmdBus.subscribe(SIMULATION_TOPICS.ABORT, async (cmd) => {
        aborts.push(cmd);
      });
      await w.orchestrator.finishSimulation({
        simulationId: SimulationId.create(started.simulationId),
        ownershipToken: OwnershipToken.create(started.ownershipToken),
      });
      expect(aborts).toHaveLength(1);
      const cmd = aborts[0] as { type: string; simulationId: string };
      expect(cmd.type).toBe(ABORT_COMMAND_TYPE);
      expect(cmd.simulationId).toBe(started.simulationId);
    });

    it('rejects OwnershipMismatch when token differs', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      const wrongToken = OwnershipToken.create('550e8400-e29b-41d4-a716-000000000abc');
      await w.ownerRepo.save({ token: wrongToken, createdAt: w.clock.now(), lastIgnitionAt: null });
      await expect(
        w.orchestrator.finishSimulation({
          simulationId: SimulationId.create(started.simulationId),
          ownershipToken: wrongToken,
        }),
      ).rejects.toThrow(OwnershipMismatchError);
    });

    it('rejects NotFound on unknown simulationId', async () => {
      const w = buildWiring();
      await expect(
        w.orchestrator.finishSimulation({
          simulationId: SimulationId.create('550e8400-e29b-41d4-a716-000000000000'),
          ownershipToken: OwnershipToken.create('550e8400-e29b-41d4-a716-000000000001'),
        }),
      ).rejects.toThrow(SimulationNotFoundError);
    });
  });

  describe('restartSimulation', () => {
    it('resets score + totalGoals + dispatches Run command when owner + FINISHED', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
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
        ownershipToken: OwnershipToken.create(started.ownershipToken),
      });
      const after = (await w.simRepo.findById(
        SimulationId.create(started.simulationId),
      ))!.toSnapshot();
      expect(after.state).toBe('RUNNING');
      expect(after.totalGoals).toBe(0);
      expect(runs).toHaveLength(1);
    });

    it('respects throttle on restart as on start', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      const sim = (await w.simRepo.findById(SimulationId.create(started.simulationId)))!;
      sim.finish('manual', w.clock.now());
      await w.simRepo.save(sim);
      sim.pullEvents();
      await w.clock.advance(2000);
      await expect(
        w.orchestrator.restartSimulation({
          simulationId: SimulationId.create(started.simulationId),
          ownershipToken: OwnershipToken.create(started.ownershipToken),
        }),
      ).rejects.toThrow(ThrottledError);
    });
  });

  describe('listSimulations + getSimulation', () => {
    it('listSimulations returns all snapshots', async () => {
      const w = buildWiring();
      const a = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      await w.clock.advance(6000);
      const b = await w.orchestrator.startSimulation({
        name: 'Paryz 2024',
        ownershipToken: OwnershipToken.create(a.ownershipToken),
      });
      const list = await w.orchestrator.listSimulations();
      expect(list.map((s) => s.id).sort()).toEqual([a.simulationId, b.simulationId].sort());
    });

    it('returns empty array when repo is empty', async () => {
      const w = buildWiring();
      const list = await w.orchestrator.listSimulations();
      expect(list).toEqual([]);
    });

    it('getSimulation returns snapshot for existing id', async () => {
      const w = buildWiring();
      const a = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      const snap = await w.orchestrator.getSimulation(SimulationId.create(a.simulationId));
      expect(snap.id).toBe(a.simulationId);
      expect(snap.name).toBe('Katar 2023');
    });

    it('getSimulation throws NotFound when missing', async () => {
      const w = buildWiring();
      await expect(
        w.orchestrator.getSimulation(SimulationId.create('550e8400-e29b-41d4-a716-111111111111')),
      ).rejects.toThrow(SimulationNotFoundError);
    });
  });
});
