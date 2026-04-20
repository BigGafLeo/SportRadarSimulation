import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationStarted } from '@simulation/domain/events/simulation-started';

const simId = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
const other = SimulationId.create('550e8400-e29b-41d4-a716-446655440001');
const at = new Date('2026-04-18T12:00:00Z');

describe('InMemoryEventBus', () => {
  it('publish delivers event to matching subscriber', async () => {
    const bus = new InMemoryEventBus();
    const received: DomainEvent[] = [];
    bus.subscribe(
      () => true,
      async (e) => {
        received.push(e);
      },
    );
    await bus.publish(new SimulationStarted(simId, at));
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('SimulationStarted');
  });

  it('filter = false skips subscriber', async () => {
    const bus = new InMemoryEventBus();
    const received: DomainEvent[] = [];
    bus.subscribe(
      () => false,
      async (e) => {
        received.push(e);
      },
    );
    await bus.publish(new SimulationStarted(simId, at));
    expect(received).toEqual([]);
  });

  it('filter can discriminate by meta.simulationId', async () => {
    const bus = new InMemoryEventBus();
    const received: DomainEvent[] = [];
    bus.subscribe(
      (_e, meta) => meta.simulationId === simId.value,
      async (e) => {
        received.push(e);
      },
    );
    await bus.publish(new SimulationStarted(simId, at), { simulationId: simId.value });
    await bus.publish(new SimulationStarted(other, at), { simulationId: other.value });
    expect(received).toHaveLength(1);
  });

  it('unsubscribe detaches', async () => {
    const bus = new InMemoryEventBus();
    const received: DomainEvent[] = [];
    const sub = bus.subscribe(
      () => true,
      async (e) => {
        received.push(e);
      },
    );
    await sub.unsubscribe();
    await bus.publish(new SimulationStarted(simId, at));
    expect(received).toEqual([]);
  });

  it('multiple subscribers each get the event when filter passes', async () => {
    const bus = new InMemoryEventBus();
    const a: DomainEvent[] = [];
    const b: DomainEvent[] = [];
    bus.subscribe(
      () => true,
      async (e) => {
        a.push(e);
      },
    );
    bus.subscribe(
      () => true,
      async (e) => {
        b.push(e);
      },
    );
    await bus.publish(new SimulationStarted(simId, at));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('handler that throws propagates error to publish caller', async () => {
    const bus = new InMemoryEventBus();
    bus.subscribe(
      () => true,
      async () => {
        throw new Error('handler exploded');
      },
    );
    await expect(bus.publish(new SimulationStarted(simId, at))).rejects.toThrow('handler exploded');
  });

  it('filter function that throws propagates error to publish caller', async () => {
    const bus = new InMemoryEventBus();
    bus.subscribe(
      () => {
        throw new Error('filter exploded');
      },
      async () => {},
    );
    await expect(bus.publish(new SimulationStarted(simId, at))).rejects.toThrow('filter exploded');
  });

  it('publish with empty meta still delivers event to subscriber', async () => {
    const bus = new InMemoryEventBus();
    const received: Array<{ event: DomainEvent; meta: unknown }> = [];
    bus.subscribe(
      () => true,
      async (e, m) => {
        received.push({ event: e, meta: m });
      },
    );
    // publish() default parameter is {} — call without explicit meta
    await bus.publish(new SimulationStarted(simId, at));
    expect(received).toHaveLength(1);
    expect(received[0].meta).toEqual({});
  });
});
