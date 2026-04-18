import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { SimulationEngine } from '@simulation/domain/ports/simulation-engine.port';
import type { EventPublisher } from '@simulation/domain/ports/event-publisher.port';
import type { Clock } from '@simulation/domain/ports/clock.port';
import type { CommandBus, Subscription } from '@shared/messaging/command-bus.port';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SIMULATION_TOPICS } from '../commands/simulation-topics';
import type { RunSimulationCommand } from '../commands/run-simulation.command';
import type { AbortSimulationCommand } from '../commands/abort-simulation.command';

export interface SimulationWorkerHandlerDeps {
  readonly simulationRepository: SimulationRepository;
  readonly commandBus: CommandBus;
  readonly eventPublisher: EventPublisher;
  readonly engine: SimulationEngine;
  readonly clock: Clock;
  readonly profileId: string;
}

interface InFlight {
  readonly controller: AbortController;
  readonly runPromise: Promise<void>;
}

export class SimulationWorkerHandler {
  private readonly inFlight = new Map<string, InFlight>();
  private readonly subscriptions: Subscription[] = [];

  constructor(private readonly deps: SimulationWorkerHandlerDeps) {}

  subscribe(): void {
    this.subscriptions.push(
      this.deps.commandBus.subscribe<RunSimulationCommand>(
        SIMULATION_TOPICS.RUN(this.deps.profileId),
        async (cmd) => {
          await this.handleRun(cmd);
        },
      ),
    );
    this.subscriptions.push(
      this.deps.commandBus.subscribe<AbortSimulationCommand>(
        SIMULATION_TOPICS.ABORT,
        async (cmd) => {
          await this.handleAbort(cmd);
        },
      ),
    );
  }

  async shutdown(): Promise<void> {
    for (const sub of this.subscriptions) {
      await sub.unsubscribe();
    }
    this.subscriptions.length = 0;
    for (const inflight of this.inFlight.values()) {
      inflight.controller.abort();
    }
    await this.drainInFlight();
  }

  async drainInFlight(): Promise<void> {
    const promises = Array.from(this.inFlight.values()).map((i) =>
      i.runPromise.catch(() => undefined),
    );
    await Promise.all(promises);
  }

  private async handleRun(cmd: RunSimulationCommand): Promise<void> {
    const sim = await this.deps.simulationRepository.findById(
      SimulationId.create(cmd.simulationId),
    );
    if (!sim) return;

    const controller = new AbortController();
    const runPromise = this.deps.engine
      .run(
        sim,
        async (event) => {
          await this.deps.simulationRepository.save(sim);
          await this.deps.eventPublisher.publish(event);
        },
        controller.signal,
      )
      .finally(() => {
        this.inFlight.delete(cmd.simulationId);
      });

    // Register before returning — do NOT await; engine runs concurrently.
    // drainInFlight() / shutdown() are the explicit sync points.
    this.inFlight.set(cmd.simulationId, { controller, runPromise });
  }

  private async handleAbort(cmd: AbortSimulationCommand): Promise<void> {
    const inflight = this.inFlight.get(cmd.simulationId);
    if (!inflight) return;

    inflight.controller.abort();
    await inflight.runPromise.catch(() => undefined);

    const sim = await this.deps.simulationRepository.findById(
      SimulationId.create(cmd.simulationId),
    );
    if (!sim) return;
    if (sim.toSnapshot().state !== 'RUNNING') return;

    sim.finish('manual', new Date(cmd.finishedAtMs));
    await this.deps.simulationRepository.save(sim);
    for (const evt of sim.pullEvents()) {
      await this.deps.eventPublisher.publish(evt);
    }
  }
}
