import type { DomainEvent } from '@simulation/domain/events/domain-event';
import type { EventBus, EventFilter, EventMeta } from './event-bus.port';
import type { Subscription } from './command-bus.port';

interface Entry {
  readonly filter: EventFilter;
  readonly handler: (event: DomainEvent, meta: EventMeta) => Promise<void>;
}

export class InMemoryEventBus implements EventBus {
  private readonly subscribers = new Set<Entry>();

  async publish(event: DomainEvent, meta: EventMeta = {}): Promise<void> {
    for (const entry of Array.from(this.subscribers)) {
      if (entry.filter(event, meta)) {
        await entry.handler(event, meta);
      }
    }
  }

  subscribe(
    filter: EventFilter,
    handler: (event: DomainEvent, meta: EventMeta) => Promise<void>,
  ): Subscription {
    const entry: Entry = { filter, handler };
    this.subscribers.add(entry);
    return {
      unsubscribe: async () => {
        this.subscribers.delete(entry);
      },
    };
  }
}
