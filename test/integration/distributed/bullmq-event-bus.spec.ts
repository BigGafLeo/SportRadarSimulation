import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { BullMQEventBus } from '@shared/messaging/bullmq-event-bus';
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import { SimulationStarted } from '@simulation/domain/events/simulation-started';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';

jest.setTimeout(60_000);

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('BullMQEventBus (Testcontainers)', () => {
  let container: StartedTestContainer;
  let redisUrl: string;
  let bus: BullMQEventBus;
  const simId = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    redisUrl = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  });

  afterAll(async () => {
    await container.stop();
  });

  beforeEach(() => {
    bus = new BullMQEventBus(redisUrl);
  });

  afterEach(async () => {
    await bus.shutdown();
  });

  it('subscriber receives published event', async () => {
    const received: DomainEvent[] = [];
    bus.subscribe(
      () => true,
      async (event) => {
        received.push(event);
      },
    );
    await bus.publish(new SimulationStarted(simId, new Date()), { simulationId: simId.value });
    await waitFor(() => received.length === 1, 5000);
    expect(received[0].type).toBe('SimulationStarted');
  });

  it('filter skips events', async () => {
    const received: DomainEvent[] = [];
    bus.subscribe(
      () => false,
      async (event) => {
        received.push(event);
      },
    );
    await bus.publish(new SimulationStarted(simId, new Date()), { simulationId: simId.value });
    await new Promise((r) => setTimeout(r, 500));
    expect(received).toEqual([]);
  });
});
