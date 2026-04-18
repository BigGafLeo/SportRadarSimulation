import type { SimulationId } from '../value-objects/simulation-id';
import type { DomainEvent } from './domain-event';

export class SimulationStarted implements DomainEvent {
  readonly type = 'SimulationStarted' as const;

  constructor(
    public readonly simulationId: SimulationId,
    public readonly occurredAt: Date,
  ) {}
}
