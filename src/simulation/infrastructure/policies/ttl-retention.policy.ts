import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { RetentionPolicy } from '@simulation/domain/ports/retention-policy.port';

export class TtlRetentionPolicy implements RetentionPolicy {
  /**
   * @param ttlMs time-to-live after finishedAt; sims older than this are GC eligible.
   */
  constructor(private readonly ttlMs: number) {}

  shouldRemove(simulation: Simulation, now: Date): boolean {
    const snap = simulation.toSnapshot();
    if (snap.state !== 'FINISHED' || snap.finishedAt === null) return false;
    return now.getTime() - snap.finishedAt.getTime() >= this.ttlMs;
  }
}
