import type { MatchDynamics, TimedEvent } from '@simulation/domain/ports/match-dynamics.port';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import { GoalScored } from '@simulation/domain/events/goal-scored';
import { pickRandomTeam } from './team-picker';

export interface UniformDynamicsConfig {
  readonly goalCount: number;
  readonly goalIntervalMs: number;
  readonly firstGoalOffsetMs: number;
}

/**
 * Produces "intent" GoalScored events at fixed intervals. Engine translates
 * each intent into sim.applyGoal(teamId, now). See ADR-001.
 */
export class UniformRandomGoalDynamics implements MatchDynamics {
  constructor(
    private readonly random: RandomProvider,
    private readonly config: UniformDynamicsConfig,
  ) {}

  async nextStep(simulation: Simulation, tickIndex: number): Promise<TimedEvent | undefined> {
    if (tickIndex >= this.config.goalCount) return undefined;
    const team = pickRandomTeam(this.random);
    const delayMs = tickIndex === 0 ? this.config.firstGoalOffsetMs : this.config.goalIntervalMs;
    const intent = new GoalScored(simulation.id, team.id, [], 0, new Date(0));
    return { delayMs, event: intent };
  }
}
