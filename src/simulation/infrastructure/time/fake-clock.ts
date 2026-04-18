import type { Clock } from '@simulation/domain/ports/clock.port';

interface PendingSleep {
  readonly resolveAt: number;
  resolve(): void;
  reject(reason: unknown): void;
}

/**
 * Deterministic Clock for tests. Call advance(ms) to move time forward and
 * resolve pending sleeps whose deadline is <= new time.
 */
export class FakeClock implements Clock {
  private current: Date;
  private pending: PendingSleep[] = [];

  constructor(initial: Date = new Date(0)) {
    this.current = new Date(initial.getTime());
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const entry: PendingSleep = {
        resolveAt: this.current.getTime() + ms,
        resolve,
        reject,
      };
      this.pending.push(entry);
      signal?.addEventListener(
        'abort',
        () => {
          this.pending = this.pending.filter((e) => e !== entry);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }

  async advance(ms: number): Promise<void> {
    const targetTime = this.current.getTime() + ms;
    while (true) {
      const eligible = this.pending
        .filter((e) => e.resolveAt <= targetTime)
        .sort((a, b) => a.resolveAt - b.resolveAt);
      if (eligible.length === 0) break;
      const next = eligible[0];
      this.current = new Date(next.resolveAt);
      this.pending = this.pending.filter((e) => e !== next);
      next.resolve();
      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });
    }
    this.current = new Date(targetTime);
  }
}
