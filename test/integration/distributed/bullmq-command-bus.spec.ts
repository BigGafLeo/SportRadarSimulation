import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { BullMQCommandBus } from '@shared/messaging/bullmq-command-bus';
import type { Command } from '@shared/messaging/command-bus.port';

jest.setTimeout(60_000);

interface TestCmd extends Command {
  type: 'test';
  payload: string;
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('BullMQCommandBus (Testcontainers)', () => {
  let container: StartedTestContainer;
  let redisUrl: string;
  let bus: BullMQCommandBus;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    redisUrl = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  });

  afterAll(async () => {
    await container.stop();
  });

  beforeEach(() => {
    bus = new BullMQCommandBus(redisUrl);
  });

  afterEach(async () => {
    await bus.shutdown();
  });

  it('dispatched command arrives at subscribed handler', async () => {
    const received: TestCmd[] = [];
    bus.subscribe<TestCmd>('topic.A', async (cmd) => {
      received.push(cmd);
    });
    await bus.dispatch<TestCmd>('topic.A', { type: 'test', payload: 'hello' });
    await waitFor(() => received.length === 1, 5000);
    expect(received[0].payload).toBe('hello');
  });

  it('different topics route to different handlers', async () => {
    const a: TestCmd[] = [];
    const b: TestCmd[] = [];
    bus.subscribe<TestCmd>('topic.A', async (c) => {
      a.push(c);
    });
    bus.subscribe<TestCmd>('topic.B', async (c) => {
      b.push(c);
    });
    await bus.dispatch<TestCmd>('topic.A', { type: 'test', payload: 'x' });
    await bus.dispatch<TestCmd>('topic.B', { type: 'test', payload: 'y' });
    await waitFor(() => a.length === 1 && b.length === 1, 5000);
    expect(a[0].payload).toBe('x');
    expect(b[0].payload).toBe('y');
  });

  it('unsubscribe stops delivery', async () => {
    const received: TestCmd[] = [];
    const sub = bus.subscribe<TestCmd>('topic.unsub', async (c) => {
      received.push(c);
    });
    await sub.unsubscribe();
    await bus.dispatch<TestCmd>('topic.unsub', { type: 'test', payload: 'nope' });
    await new Promise((r) => setTimeout(r, 500));
    expect(received).toEqual([]);
  });
});
