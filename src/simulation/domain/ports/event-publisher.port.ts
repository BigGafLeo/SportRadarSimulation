import type { DomainEvent } from '../events/domain-event';

/**
 * Domain event publication port (observer-facing).
 * Default impl: InMemoryEventPublisher wrapping EventBus (Phase 1b).
 */
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
