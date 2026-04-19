import type { Clock } from '@simulation/domain/ports/clock.port';
import type { MatchDynamics } from '@simulation/domain/ports/match-dynamics.port';
import type { SimulationEngine } from '@simulation/domain/ports/simulation-engine.port';
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import { GoalScored } from '@simulation/domain/events/goal-scored';

/**
 * Drives the simulation tick loop. For each tick:
 *   1. Ask dynamics for next intent + delay
 *   2. Sleep
 *   3. Dispatch intent to aggregate (applyGoal for GoalScored)
 *   4. Drain aggregate.pullEvents() through the emit callback
 * When dynamics returns undefined, engine calls sim.finish('auto') and drains.
 * On abort signal, engine returns without calling finish (orchestrator handles
 * the manual-finish flow).
 *
 * See ADR-001 for the intent-pattern rationale.
 */
export class TickingSimulationEngine implements SimulationEngine {
  constructor(
    private readonly clock: Clock,
    private readonly dynamics: MatchDynamics,
  ) {}

  async run(
    simulation: Simulation,
    emit: (event: DomainEvent) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) {
      this.dynamics.onAbort?.(simulation.id.value);
      return;
    }

    for (let tick = 0; ; tick++) {
      if (signal.aborted) {
        this.dynamics.onAbort?.(simulation.id.value);
        return;
      }

      const step = await this.dynamics.nextStep(simulation, tick);
      if (!step) break;

      try {
        await this.clock.sleep(step.delayMs, signal);
      } catch {
        this.dynamics.onAbort?.(simulation.id.value);
        return;
      }
      if (signal.aborted) {
        this.dynamics.onAbort?.(simulation.id.value);
        return;
      }

      const now = this.clock.now();
      this.dispatchIntent(simulation, step.event, now);
      for (const evt of simulation.pullEvents()) {
        await emit(evt);
      }
    }

    if (signal.aborted) {
      this.dynamics.onAbort?.(simulation.id.value);
      return;
    }
    simulation.finish('auto', this.clock.now());
    for (const evt of simulation.pullEvents()) {
      await emit(evt);
    }
  }

  private dispatchIntent(simulation: Simulation, intent: DomainEvent, now: Date): void {
    if (intent instanceof GoalScored) {
      simulation.applyGoal(intent.teamId, now);
      return;
    }
    throw new Error(`Unhandled intent event type: ${intent.type}`);
  }
}
