import type { Simulation } from '../aggregates/simulation';
import type { DomainEvent } from '../events/domain-event';

/**
 * Simulation runtime port (streaming-based per design spec §6.3).
 * Default impl: TickingSimulationEngine (Phase 1b). Injects: Clock + MatchDynamics.
 *
 * run() drives the ticking loop until either MatchDynamics.nextStep returns undefined
 * (natural completion, engine emits SimulationFinished with reason 'auto') or signal aborts
 * (manual finish — engine returns without emitting; orchestrator emits finished with reason 'manual').
 */
export interface SimulationEngine {
  run(
    simulation: Simulation,
    emit: (event: DomainEvent) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void>;
}
