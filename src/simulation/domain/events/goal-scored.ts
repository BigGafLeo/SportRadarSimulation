import type { SimulationId } from '../value-objects/simulation-id';
import type { TeamId } from '../value-objects/team-id';
import type { MatchScoreSnapshot } from '../value-objects/score-board';
import type { DomainEvent } from './domain-event';

export class GoalScored implements DomainEvent {
  readonly type = 'GoalScored' as const;

  constructor(
    public readonly simulationId: SimulationId,
    public readonly teamId: TeamId,
    public readonly score: readonly MatchScoreSnapshot[],
    public readonly totalGoals: number,
    public readonly occurredAt: Date,
  ) {}
}
