import type { Simulation } from '../aggregates/simulation';
import type { DomainEvent } from '../events/domain-event';

export interface TimedEvent {
  readonly delayMs: number;
  readonly event: DomainEvent;
}

/**
 * Decision strategy port — "what event and when".
 * Default impl: UniformRandomGoalDynamics (1/6 team, 9 goals, 1s interval) — Phase 1b.
 * Phase 3+: PoissonGoalDynamics, FastMarkovDynamics.
 *
 * nextStep() returns undefined when the match is naturally finished (engine auto-finishes).
 * onAbort() is called by the engine when a run is aborted before natural end —
 * stateful dynamics use it to drop per-simulation bookkeeping.
 */
export interface MatchDynamics {
  nextStep(simulation: Simulation, tickIndex: number): Promise<TimedEvent | undefined>;
  onAbort?(simulationId: string): void;
}
