import type { Simulation } from '../aggregates/simulation';

/**
 * GC policy for FINISHED simulations.
 * Default impl: TtlRetentionPolicy(1h) — Phase 1b.
 */
export interface RetentionPolicy {
  shouldRemove(simulation: Simulation, now: Date): boolean;
}
