import { InMemoryEventPublisher } from '@shared/messaging/in-memory-event-publisher';
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import { SimulationStarted } from '@simulation/domain/events/simulation-started';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';

const simId = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
const at = new Date('2026-04-18T12:00:00Z');

describe('InMemoryEventPublisher', () => {
  it('publishes via underlying EventBus with meta.simulationId auto-derived', async () => {
    const bus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(bus);
    const received: Array<{ event: unknown; meta: unknown }> = [];
    bus.subscribe(
      () => true,
      async (event, meta) => {
        received.push({ event, meta });
      },
    );
    await publisher.publish(new SimulationStarted(simId, at));
    expect(received).toHaveLength(1);
    expect(received[0].meta).toEqual({ simulationId: simId.value });
  });
});
