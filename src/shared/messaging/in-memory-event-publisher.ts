import type { DomainEvent } from '@simulation/domain/events/domain-event';
import type { EventPublisher } from '@simulation/domain/ports/event-publisher.port';
import type { EventBus } from './event-bus.port';

/**
 * EventPublisher adapter that delegates to EventBus, auto-populating
 * meta.simulationId from event.simulationId.
 */
export class InMemoryEventPublisher implements EventPublisher {
  constructor(private readonly bus: EventBus) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.bus.publish(event, { simulationId: event.simulationId.value });
  }
}
