import { InMemoryCommandBus } from '@shared/messaging/in-memory-command-bus';
import type { Command } from '@shared/messaging/command-bus.port';

interface RunCommand extends Command {
  type: 'run';
  id: string;
}

describe('InMemoryCommandBus', () => {
  it('dispatch invokes subscribed handler for matching topic', async () => {
    const bus = new InMemoryCommandBus();
    const received: RunCommand[] = [];
    bus.subscribe<RunCommand>('sim.run', async (c) => {
      received.push(c);
    });
    await bus.dispatch<RunCommand>('sim.run', { type: 'run', id: 'a' });
    expect(received).toHaveLength(1);
    expect(received[0].id).toBe('a');
  });

  it('dispatch with unsubscribed topic is a no-op', async () => {
    const bus = new InMemoryCommandBus();
    await expect(bus.dispatch('no.subscribers', { type: 'x' })).resolves.toBeUndefined();
  });

  it('multiple subscribers on same topic all receive', async () => {
    const bus = new InMemoryCommandBus();
    const a: string[] = [];
    const b: string[] = [];
    bus.subscribe<RunCommand>('sim.run', async (c) => {
      a.push(c.id);
    });
    bus.subscribe<RunCommand>('sim.run', async (c) => {
      b.push(c.id);
    });
    await bus.dispatch<RunCommand>('sim.run', { type: 'run', id: '42' });
    expect(a).toEqual(['42']);
    expect(b).toEqual(['42']);
  });

  it('unsubscribe detaches handler', async () => {
    const bus = new InMemoryCommandBus();
    const received: RunCommand[] = [];
    const sub = bus.subscribe<RunCommand>('sim.run', async (c) => {
      received.push(c);
    });
    await sub.unsubscribe();
    await bus.dispatch<RunCommand>('sim.run', { type: 'run', id: 'ignored' });
    expect(received).toEqual([]);
  });

  it('subscribers on different topics are isolated', async () => {
    const bus = new InMemoryCommandBus();
    const onRun: string[] = [];
    const onAbort: string[] = [];
    bus.subscribe<RunCommand>('sim.run', async (c) => {
      onRun.push(c.id);
    });
    bus.subscribe<RunCommand>('sim.abort', async (c) => {
      onAbort.push(c.id);
    });
    await bus.dispatch<RunCommand>('sim.run', { type: 'run', id: 'r' });
    expect(onRun).toEqual(['r']);
    expect(onAbort).toEqual([]);
  });
});
