import { AcceleratedClock } from '@simulation/infrastructure/time/accelerated-clock';
import { SystemClock } from '@simulation/infrastructure/time/system-clock';

describe('AcceleratedClock', () => {
  it('returns real time from now() (no acceleration on timestamps)', () => {
    const base = new SystemClock();
    const clock = new AcceleratedClock(base, 100);
    const before = Date.now();
    const now = clock.now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('sleep(1000) at factor=10 finishes in ~100ms', async () => {
    const clock = new AcceleratedClock(new SystemClock(), 10);
    const start = Date.now();
    await clock.sleep(1000);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(elapsed).toBeLessThanOrEqual(200);
  });

  it('sleep aborts via AbortSignal', async () => {
    const clock = new AcceleratedClock(new SystemClock(), 1);
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 30);
    await expect(clock.sleep(1000, ac.signal)).rejects.toBeDefined();
  });

  it('throws on factor <= 0', () => {
    expect(() => new AcceleratedClock(new SystemClock(), 0)).toThrow();
    expect(() => new AcceleratedClock(new SystemClock(), -1)).toThrow();
  });

  it('factor=1 → sleep duration matches real time (no acceleration)', async () => {
    const clock = new AcceleratedClock(new SystemClock(), 1);
    const start = Date.now();
    await clock.sleep(80);
    const elapsed = Date.now() - start;
    // factor=1 means no division — should sleep ~80ms
    expect(elapsed).toBeGreaterThanOrEqual(60);
    expect(elapsed).toBeLessThanOrEqual(200);
  });

  it('sleep(0) → resolves immediately regardless of factor', async () => {
    const clock = new AcceleratedClock(new SystemClock(), 1000);
    const start = Date.now();
    await clock.sleep(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
