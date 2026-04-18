import type { SimulationId } from '../value-objects/simulation-id';
import type { SimulationName } from '../value-objects/simulation-name';
import type { Match } from '../value-objects/match';
import { ScoreBoard } from '../value-objects/score-board';
import type { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import type { SimulationState } from '../errors/invalid-state.error';
import type { DomainEvent } from '../events/domain-event';
import { SimulationStarted } from '../events/simulation-started';

export interface SimulationSnapshot {
  readonly id: string;
  readonly ownerToken: string;
  readonly name: string;
  readonly state: SimulationState;
  readonly score: ReturnType<ScoreBoard['snapshot']>;
  readonly totalGoals: number;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly profileId: string;
}

export interface CreateSimulationInput {
  readonly id: SimulationId;
  readonly ownerToken: OwnershipToken;
  readonly name: SimulationName;
  readonly matches: readonly Match[];
  readonly profileId: string;
  readonly now: Date;
}

export class Simulation {
  private pendingEvents: DomainEvent[] = [];

  private constructor(
    public readonly id: SimulationId,
    public readonly ownerToken: OwnershipToken,
    public readonly name: SimulationName,
    public readonly profileId: string,
    private state: SimulationState,
    private score: ScoreBoard,
    private startedAt: Date,
    private finishedAt: Date | null,
    private totalGoals: number,
  ) {}

  static create(input: CreateSimulationInput): Simulation {
    const scoreBoard = ScoreBoard.fromMatches(input.matches);
    const sim = new Simulation(
      input.id,
      input.ownerToken,
      input.name,
      input.profileId,
      'RUNNING',
      scoreBoard,
      input.now,
      null,
      0,
    );
    sim.pendingEvents.push(new SimulationStarted(input.id, input.now));
    return sim;
  }

  pullEvents(): readonly DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  toSnapshot(): SimulationSnapshot {
    return {
      id: this.id.value,
      ownerToken: this.ownerToken.value,
      name: this.name.value,
      state: this.state,
      score: this.score.snapshot(),
      totalGoals: this.totalGoals,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      profileId: this.profileId,
    };
  }
}
