import { SystemClock } from '@simulation/infrastructure/time/system-clock';

describe('SystemClock', () => {
  const clock = new SystemClock();

  it('now() returns a Date close to real wall clock', () => {
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  it('sleep(0) resolves (almost) immediately', async () => {
    const start = Date.now();
    await clock.sleep(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('sleep(30) waits at least ~30ms', async () => {
    const start = Date.now();
    await clock.sleep(30);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });

  it('sleep rejects when signal is already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort(new Error('aborted pre-sleep'));
    await expect(clock.sleep(100, ctrl.signal)).rejects.toThrow('aborted pre-sleep');
  });

  it('sleep rejects when signal aborts mid-wait', async () => {
    const ctrl = new AbortController();
    const sleepPromise = clock.sleep(1000, ctrl.signal);
    setTimeout(() => ctrl.abort(new Error('mid-abort')), 10);
    await expect(sleepPromise).rejects.toThrow('mid-abort');
  });
});
