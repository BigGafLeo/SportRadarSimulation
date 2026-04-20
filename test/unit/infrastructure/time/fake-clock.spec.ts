import { FakeClock } from '@simulation/infrastructure/time/fake-clock';

describe('FakeClock', () => {
  it('now() returns initial time until advanced', () => {
    const clock = new FakeClock(new Date('2026-01-01T00:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('advance(ms) moves now forward', async () => {
    const clock = new FakeClock(new Date('2026-01-01T00:00:00Z'));
    await clock.advance(1500);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:01.500Z');
  });

  it('sleep pending resolves when advance passes its deadline', async () => {
    const clock = new FakeClock(new Date(0));
    let resolved = false;
    const promise = clock.sleep(100).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    await clock.advance(50);
    expect(resolved).toBe(false);
    await clock.advance(50);
    await promise;
    expect(resolved).toBe(true);
  });

  it('multiple sleeps resolve in deadline order', async () => {
    const clock = new FakeClock(new Date(0));
    const order: number[] = [];
    const p1 = clock.sleep(200).then(() => order.push(1));
    const p2 = clock.sleep(100).then(() => order.push(2));
    const p3 = clock.sleep(300).then(() => order.push(3));
    await clock.advance(300);
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([2, 1, 3]);
  });

  it('sleep rejects when signal aborts', async () => {
    const clock = new FakeClock(new Date(0));
    const ctrl = new AbortController();
    const sleepPromise = clock.sleep(100, ctrl.signal);
    ctrl.abort(new Error('abort-fake'));
    await expect(sleepPromise).rejects.toThrow('abort-fake');
  });

  it('sleep rejects when signal already aborted', async () => {
    const clock = new FakeClock(new Date(0));
    const ctrl = new AbortController();
    ctrl.abort(new Error('pre-aborted'));
    await expect(clock.sleep(100, ctrl.signal)).rejects.toThrow('pre-aborted');
  });

  it('advance(0) does not change now()', async () => {
    const clock = new FakeClock(new Date('2026-01-01T00:00:00Z'));
    const before = clock.now().toISOString();
    await clock.advance(0);
    expect(clock.now().toISOString()).toBe(before);
  });
});
