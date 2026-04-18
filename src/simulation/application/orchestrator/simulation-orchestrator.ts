import { Simulation } from '@simulation/domain/aggregates/simulation';
import { InvalidStateError } from '@simulation/domain/errors/invalid-state.error';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import type { SimulationSnapshot } from '@simulation/domain/aggregates/simulation';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { SimulationConfig } from '@simulation/domain/simulation-config';
import type { Clock } from '@simulation/domain/ports/clock.port';
import type { ThrottlePolicy } from '@simulation/domain/ports/throttle-policy.port';
import type { EventPublisher } from '@simulation/domain/ports/event-publisher.port';
import type { OwnershipRepository } from '@ownership/domain/ports/ownership-repository.port';
import type { OwnershipTokenGenerator } from '@ownership/domain/ports/ownership-token-generator.port';
import type { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import type { CommandBus } from '@shared/messaging/command-bus.port';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import { runSimulationCommand } from '../commands/run-simulation.command';
import { abortSimulationCommand } from '../commands/abort-simulation.command';
import { SIMULATION_TOPICS } from '../commands/simulation-topics';
import {
  SimulationNotFoundError,
  OwnershipMismatchError,
  ThrottledError,
  UnknownTokenError,
} from './orchestrator.errors';

export interface StartSimulationInput {
  readonly name: string;
  readonly ownershipToken?: OwnershipToken;
  readonly profileId?: string;
}

export interface StartSimulationResult {
  readonly simulationId: string;
  readonly ownershipToken: string;
  readonly state: 'RUNNING';
  readonly initialSnapshot: SimulationSnapshot;
}

export interface FinishSimulationInput {
  readonly simulationId: SimulationId;
  readonly ownershipToken: OwnershipToken;
}

export interface RestartSimulationInput {
  readonly simulationId: SimulationId;
  readonly ownershipToken: OwnershipToken;
}

export interface SimulationOrchestratorDeps {
  readonly simulationRepository: SimulationRepository;
  readonly ownershipRepository: OwnershipRepository;
  readonly tokenGenerator: OwnershipTokenGenerator;
  readonly throttlePolicy: ThrottlePolicy;
  readonly commandBus: CommandBus;
  readonly eventPublisher: EventPublisher;
  readonly clock: Clock;
  readonly config: SimulationConfig;
  readonly defaultProfileId: string;
}

export class SimulationOrchestrator {
  constructor(private readonly deps: SimulationOrchestratorDeps) {}

  async startSimulation(input: StartSimulationInput): Promise<StartSimulationResult> {
    const name = SimulationName.create(input.name);
    const profileId = input.profileId ?? this.deps.defaultProfileId;
    const now = this.deps.clock.now();

    const token = await this.resolveOrIssueToken(input.ownershipToken, now);
    await this.ensureCanIgnite(token, now);

    const simulationId = SimulationId.create(this.deps.tokenGenerator.generate().value);
    const sim = Simulation.create({
      id: simulationId,
      ownerToken: token,
      name,
      matches: PRESET_MATCHES,
      profileId,
      now,
    });

    await this.deps.simulationRepository.save(sim);
    await this.deps.ownershipRepository.updateLastIgnitionAt(token, now);
    for (const evt of sim.pullEvents()) {
      await this.deps.eventPublisher.publish(evt);
    }

    await this.deps.commandBus.dispatch(
      SIMULATION_TOPICS.RUN(profileId),
      runSimulationCommand(simulationId.value, profileId),
    );

    return {
      simulationId: simulationId.value,
      ownershipToken: token.value,
      state: 'RUNNING',
      initialSnapshot: sim.toSnapshot(),
    };
  }

  async finishSimulation(input: FinishSimulationInput): Promise<void> {
    const sim = await this.findSimulationOrThrow(input.simulationId);
    await this.requireKnownToken(input.ownershipToken);
    this.assertOwnership(sim, input.ownershipToken);
    await this.deps.commandBus.dispatch(
      SIMULATION_TOPICS.ABORT,
      abortSimulationCommand(input.simulationId.value, this.deps.clock.now().getTime()),
    );
  }

  async restartSimulation(input: RestartSimulationInput): Promise<void> {
    const sim = await this.findSimulationOrThrow(input.simulationId);
    await this.requireKnownToken(input.ownershipToken);
    this.assertOwnership(sim, input.ownershipToken);
    // State check before throttle: a RUNNING sim cannot be restarted regardless of cooldown.
    const snapshot = sim.toSnapshot();
    if (snapshot.state !== 'FINISHED') {
      throw new InvalidStateError(snapshot.state, 'restart');
    }
    const now = this.deps.clock.now();
    await this.ensureCanIgnite(input.ownershipToken, now);
    sim.restart(now);
    await this.deps.simulationRepository.save(sim);
    await this.deps.ownershipRepository.updateLastIgnitionAt(input.ownershipToken, now);
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

  private async resolveOrIssueToken(
    provided: OwnershipToken | undefined,
    now: Date,
  ): Promise<OwnershipToken> {
    if (provided) {
      const rec = await this.deps.ownershipRepository.findByToken(provided);
      if (!rec) {
        throw new UnknownTokenError(provided.value);
      }
      return provided;
    }
    const token = this.deps.tokenGenerator.generate();
    await this.deps.ownershipRepository.save({
      token,
      createdAt: now,
      lastIgnitionAt: null,
    });
    return token;
  }

  private async ensureCanIgnite(token: OwnershipToken, now: Date): Promise<void> {
    const rec = await this.deps.ownershipRepository.findByToken(token);
    if (!rec) {
      throw new UnknownTokenError(token.value);
    }
    if (!this.deps.throttlePolicy.canIgnite(token, rec.lastIgnitionAt, now)) {
      throw new ThrottledError(this.deps.config.startCooldownMs);
    }
  }

  private async requireKnownToken(token: OwnershipToken): Promise<void> {
    const rec = await this.deps.ownershipRepository.findByToken(token);
    if (!rec) {
      throw new UnknownTokenError(token.value);
    }
  }

  private async findSimulationOrThrow(id: SimulationId): Promise<Simulation> {
    const sim = await this.deps.simulationRepository.findById(id);
    if (!sim) {
      throw new SimulationNotFoundError(id.value);
    }
    return sim;
  }

  private assertOwnership(sim: Simulation, token: OwnershipToken): void {
    if (!sim.ownerToken.equals(token)) {
      throw new OwnershipMismatchError(sim.id.value);
    }
  }
}
