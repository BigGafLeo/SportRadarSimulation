import type { MatchDynamics, TimedEvent } from '@simulation/domain/ports/match-dynamics.port';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { CoreSimulationConfig } from '@simulation/domain/core-simulation-config';
import { GoalScored } from '@simulation/domain/events/goal-scored';
import { PRESET_TEAMS } from '@simulation/domain/value-objects/matches-preset';

export interface PoissonDynamicsConfig {
  /** Expected goals per team across the entire match duration. */
  readonly goalsPerTeamMean: number;
}

interface RunState {
  /** Cumulative virtual ms since match start when the next goal fires. */
  nextAt: number;
  /** Cumulative virtual ms of the most recent emitted event. */
  lastEventAt: number;
}

/**
 * Single Poisson process across all PRESET_TEAMS (sum of independent
 * per-team Poissons is itself Poisson with summed rate). Inter-arrival
 * times sampled from exponential distribution: dt = -ln(U) / λ where
 * λ = (goalsPerTeamMean * teamCount) / durationMs.
 *
 * Stateful per simulationId. State initialised on tick=0 and removed
 * when match duration exhausts (returns undefined).
 */
export class PoissonGoalDynamics implements MatchDynamics {
  private readonly state = new Map<string, RunState>();

  constructor(
    private readonly random: RandomProvider,
    private readonly core: CoreSimulationConfig,
    private readonly config: PoissonDynamicsConfig,
  ) {}

  async nextStep(simulation: Simulation, tickIndex: number): Promise<TimedEvent | undefined> {
    const id = simulation.id.value;
    const totalRatePerMs =
      (this.config.goalsPerTeamMean * PRESET_TEAMS.length) / this.core.durationMs;

    let st = this.state.get(id);
    if (!st || tickIndex === 0) {
      st = { nextAt: this.sampleExp(totalRatePerMs), lastEventAt: 0 };
      this.state.set(id, st);
    }

    if (st.nextAt > this.core.durationMs) {
      this.state.delete(id);
      return undefined;
    }

    const fireAt = st.nextAt;
    const delayMs = Math.max(0, fireAt - st.lastEventAt);
    st.lastEventAt = fireAt;
    st.nextAt = fireAt + this.sampleExp(totalRatePerMs);

    const team = PRESET_TEAMS[this.random.int(0, PRESET_TEAMS.length - 1)];
    const intent = new GoalScored(simulation.id, team.id, [], 0, new Date(0));
    return { delayMs, event: intent };
  }

  /** Visible for tests — verifies cleanup discipline. */
  activeStateCount(): number {
    return this.state.size;
  }

  private sampleExp(lambda: number): number {
    const u = Math.max(this.random.float(), Number.EPSILON);
    return -Math.log(u) / lambda;
  }
}
