import type { MatchDynamics, TimedEvent } from '@simulation/domain/ports/match-dynamics.port';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { SimulationConfig } from '@simulation/domain/simulation-config';
import { GoalScored } from '@simulation/domain/events/goal-scored';
import { PRESET_TEAMS } from '@simulation/domain/value-objects/matches-preset';

/**
 * Produces "intent" GoalScored events: the engine translates each intent into
 * sim.applyGoal(teamId, now) and forwards the aggregate's real emitted event.
 * Placeholder fields (score, totalGoals, occurredAt) are ignored by engine.
 * See ADR-001 (to be added in Task 9).
 */
export class UniformRandomGoalDynamics implements MatchDynamics {
  constructor(
    private readonly random: RandomProvider,
    private readonly config: SimulationConfig,
  ) {}

  async nextStep(simulation: Simulation, tickIndex: number): Promise<TimedEvent | undefined> {
    if (tickIndex >= this.config.goalCount) return undefined;

    const teamIndex = this.random.int(0, PRESET_TEAMS.length - 1);
    const team = PRESET_TEAMS[teamIndex];

    const delayMs = tickIndex === 0 ? this.config.firstGoalOffsetMs : this.config.goalIntervalMs;

    const intent = new GoalScored(simulation.id, team.id, [], 0, new Date(0));

    return { delayMs, event: intent };
  }
}
