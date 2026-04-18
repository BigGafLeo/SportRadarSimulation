import type { SimulationId } from '../value-objects/simulation-id';

export interface DomainEvent {
  readonly type: string;
  readonly simulationId: SimulationId;
  readonly occurredAt: Date;
}
