import { randomUUID } from 'crypto';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { InvalidStateError } from '@simulation/domain/errors/invalid-state.error';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import type { SimulationSnapshot } from '@simulation/domain/aggregates/simulation';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { Clock } from '@simulation/domain/ports/clock.port';
import type { ThrottlePolicy } from '@simulation/domain/ports/throttle-policy.port';
import type { EventPublisher } from '@simulation/domain/ports/event-publisher.port';
import type { CommandBus } from '@shared/messaging/command-bus.port';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import { runSimulationCommand } from '../commands/run-simulation.command';
import { abortSimulationCommand } from '../commands/abort-simulation.command';
import { SIMULATION_TOPICS } from '../commands/simulation-topics';
import {
  SimulationNotFoundError,
  OwnershipMismatchError,
  ThrottledError,
} from './orchestrator.errors';

export interface StartSimulationInput {
  readonly userId: string;
  readonly name: string;
  readonly profileId?: string;
}

export interface StartSimulationResult {
  readonly simulationId: string;
  readonly state: 'RUNNING';
  readonly initialSnapshot: SimulationSnapshot;
}

export interface FinishSimulationInput {
  readonly simulationId: SimulationId;
  readonly userId: string;
}

export interface RestartSimulationInput {
  readonly simulationId: SimulationId;
  readonly userId: string;
}

export interface SimulationOrchestratorDeps {
  readonly simulationRepository: SimulationRepository;
  readonly throttlePolicy: ThrottlePolicy;
  readonly commandBus: CommandBus;
  readonly eventPublisher: EventPublisher;
  readonly clock: Clock;
  readonly cooldownMs: number;
  readonly defaultProfileId: string;
}

export class SimulationOrchestrator {
  constructor(private readonly deps: SimulationOrchestratorDeps) {}

  async startSimulation(input: StartSimulationInput): Promise<StartSimulationResult> {
    const name = SimulationName.create(input.name);
    const profileId = input.profileId ?? this.deps.defaultProfileId;
    const now = this.deps.clock.now();

    await this.ensureCanIgnite(input.userId, now);

    const simulationId = SimulationId.create(randomUUID());
    const sim = Simulation.create({
      id: simulationId,
      ownerId: input.userId,
      name,
      matches: PRESET_MATCHES,
      profileId,
      now,
    });

    await this.deps.simulationRepository.save(sim);
    for (const evt of sim.pullEvents()) {
      await this.deps.eventPublisher.publish(evt);
    }

    await this.deps.commandBus.dispatch(
      SIMULATION_TOPICS.RUN(profileId),
      runSimulationCommand(simulationId.value, profileId),
    );

    return {
      simulationId: simulationId.value,
      state: 'RUNNING',
      initialSnapshot: sim.toSnapshot(),
    };
  }

  async finishSimulation(input: FinishSimulationInput): Promise<void> {
    const sim = await this.findSimulationOrThrow(input.simulationId);
    this.assertOwnership(sim, input.userId);
    await this.deps.commandBus.dispatch(
      SIMULATION_TOPICS.ABORT,
      abortSimulationCommand(input.simulationId.value, this.deps.clock.now().getTime()),
    );
  }

  async restartSimulation(input: RestartSimulationInput): Promise<void> {
    const sim = await this.findSimulationOrThrow(input.simulationId);
    this.assertOwnership(sim, input.userId);
    const snapshot = sim.toSnapshot();
    if (snapshot.state !== 'FINISHED') {
      throw new InvalidStateError(snapshot.state, 'restart');
    }
    const now = this.deps.clock.now();
    await this.ensureCanIgnite(input.userId, now);
    sim.restart(now);
    await this.deps.simulationRepository.save(sim);
    for (const evt of sim.pullEvents()) {
      await this.deps.eventPublisher.publish(evt);
    }

    await this.deps.commandBus.dispatch(
      SIMULATION_TOPICS.RUN(sim.profileId),
      runSimulationCommand(input.simulationId.value, sim.profileId),
    );
  }

  async listSimulations(): Promise<readonly SimulationSnapshot[]> {
    const all = await this.deps.simulationRepository.findAll();
    return all.map((s) => s.toSnapshot());
  }

  async getSimulation(id: SimulationId): Promise<SimulationSnapshot> {
    const sim = await this.findSimulationOrThrow(id);
    return sim.toSnapshot();
  }

  private async ensureCanIgnite(userId: string, now: Date): Promise<void> {
    const lastStartedAt = await this.deps.simulationRepository.findLastStartedAtByOwner(userId);
    if (!this.deps.throttlePolicy.canIgnite(userId, lastStartedAt, now)) {
      throw new ThrottledError(this.deps.cooldownMs);
    }
  }

  private async findSimulationOrThrow(id: SimulationId): Promise<Simulation> {
    const sim = await this.deps.simulationRepository.findById(id);
    if (!sim) {
      throw new SimulationNotFoundError(id.value);
    }
    return sim;
  }

  private assertOwnership(sim: Simulation, userId: string): void {
    if (sim.ownerId !== userId) {
      throw new OwnershipMismatchError(sim.id.value);
    }
  }
}
