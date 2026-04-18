import type { SimulationId } from '../value-objects/simulation-id';
import type { DomainEvent } from './domain-event';

export class SimulationRestarted implements DomainEvent {
  readonly type = 'SimulationRestarted' as const;

  constructor(
    public readonly simulationId: SimulationId,
    public readonly occurredAt: Date,
  ) {}
}
