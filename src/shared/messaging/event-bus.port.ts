import type { DomainEvent } from '@simulation/domain/events/domain-event';
import type { Subscription } from './command-bus.port';

export interface EventMeta {
  readonly simulationId?: string;
  readonly correlationId?: string;
}

export type EventFilter = (event: DomainEvent, meta: EventMeta) => boolean;

/**
 * Event publish/subscribe port.
 * Default impl (Phase 1): InMemoryEventBus.
 * Later (Phase 2): BullMQEventBus.
 */
export interface EventBus {
  publish(event: DomainEvent, meta?: EventMeta): Promise<void>;
  subscribe(
    filter: EventFilter,
    handler: (event: DomainEvent, meta: EventMeta) => Promise<void>,
  ): Subscription;
}
