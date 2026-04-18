import type { SimulationId } from '../value-objects/simulation-id';
import type { MatchScoreSnapshot } from '../value-objects/score-board';
import type { DomainEvent } from './domain-event';

export type FinishReason = 'manual' | 'auto';

export class SimulationFinished implements DomainEvent {
  readonly type = 'SimulationFinished' as const;

  constructor(
    public readonly simulationId: SimulationId,
    public readonly reason: FinishReason,
    public readonly finalScore: readonly MatchScoreSnapshot[],
    public readonly totalGoals: number,
    public readonly occurredAt: Date,
  ) {}
}
