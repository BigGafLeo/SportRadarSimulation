import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { BullMQCommandBus } from '@shared/messaging/bullmq-command-bus';
import { SIMULATION_TOPICS } from '@simulation/application/commands/simulation-topics';
import { runSimulationCommand } from '@simulation/application/commands/run-simulation.command';

describe('Per-profile topic routing (Redis Testcontainer)', () => {
  let container: StartedTestContainer;
  let redisUrl: string;
  const buses: BullMQCommandBus[] = [];

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const port = container.getMappedPort(6379);
    redisUrl = `redis://${container.getHost()}:${port}`;
  }, 60_000);

  afterAll(async () => {
    for (const b of buses) await b.shutdown();
    await container.stop();
  }, 60_000);

  function bus(): BullMQCommandBus {
    const b = new BullMQCommandBus(redisUrl);
    buses.push(b);
    return b;
  }

  it('worker subscribed to "uniform-realtime" does NOT receive "poisson-accelerated" job', async () => {
    const producer = bus();
    const uniformConsumer = bus();
    const poissonConsumer = bus();

    let uniformReceived = 0;
    let poissonReceived = 0;
    uniformConsumer.subscribe(SIMULATION_TOPICS.RUN('uniform-realtime'), async () => {
      uniformReceived++;
    });
    poissonConsumer.subscribe(SIMULATION_TOPICS.RUN('poisson-accelerated'), async () => {
      poissonReceived++;
    });

    await producer.dispatch(
      SIMULATION_TOPICS.RUN('poisson-accelerated'),
      runSimulationCommand('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'poisson-accelerated'),
    );

    await new Promise((r) => setTimeout(r, 1500));
    expect(poissonReceived).toBe(1);
    expect(uniformReceived).toBe(0);
  }, 30_000);

  it('two workers on same profile share load', async () => {
    const producer = bus();
    const consumerA = bus();
    const consumerB = bus();

    let aCount = 0;
    let bCount = 0;
    consumerA.subscribe(SIMULATION_TOPICS.RUN('fast-markov'), async () => {
      aCount++;
    });
    consumerB.subscribe(SIMULATION_TOPICS.RUN('fast-markov'), async () => {
      bCount++;
    });

    for (let i = 0; i < 6; i++) {
      await producer.dispatch(
        SIMULATION_TOPICS.RUN('fast-markov'),
        runSimulationCommand(
          `aaaaaaaa-bbbb-4ccc-8ddd-${String(i).padStart(12, '0')}`,
          'fast-markov',
        ),
      );
    }
    await new Promise((r) => setTimeout(r, 2500));
    expect(aCount + bCount).toBe(6);
    expect(aCount).toBeGreaterThan(0);
    expect(bCount).toBeGreaterThan(0);
  }, 30_000);
});
