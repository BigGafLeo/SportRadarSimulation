import type { Clock } from '@simulation/domain/ports/clock.port';

/**
 * Wraps any Clock impl, dividing sleep() durations by `factor` while
 * leaving now() untouched. See ADR-005.
 */
export class AcceleratedClock implements Clock {
  constructor(
    private readonly base: Clock,
    private readonly factor: number,
  ) {
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new Error(`AcceleratedClock factor must be > 0, got ${factor}`);
    }
  }

  now(): Date {
    return this.base.now();
  }

  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return this.base.sleep(ms / this.factor, signal);
  }
}
