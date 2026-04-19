import type { MatchDynamics, TimedEvent } from '@simulation/domain/ports/match-dynamics.port';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { CoreSimulationConfig } from '@simulation/domain/core-simulation-config';
import { GoalScored } from '@simulation/domain/events/goal-scored';
import { PRESET_TEAMS } from '@simulation/domain/value-objects/matches-preset';

export interface MarkovDynamicsConfig {
  /** Virtual ms between Markov transitions. */
  readonly stepMs: number;
}

type State = 'MIDFIELD' | 'OFFENSIVE_ATTACK' | 'SHOT' | 'GOAL' | 'COUNTER' | 'DEFENSIVE_BLOCK';

interface Transition {
  readonly to: State;
  readonly p: number;
}

const TRANSITIONS: Record<State, readonly Transition[]> = {
  MIDFIELD: [
    { to: 'OFFENSIVE_ATTACK', p: 0.35 },
    { to: 'COUNTER', p: 0.2 },
    { to: 'DEFENSIVE_BLOCK', p: 0.45 },
  ],
  OFFENSIVE_ATTACK: [
    { to: 'SHOT', p: 0.4 },
    { to: 'MIDFIELD', p: 0.6 },
  ],
  SHOT: [
    { to: 'GOAL', p: 0.14 },
    { to: 'DEFENSIVE_BLOCK', p: 0.5 },
    { to: 'COUNTER', p: 0.36 },
  ],
  GOAL: [{ to: 'MIDFIELD', p: 1.0 }],
  COUNTER: [
    { to: 'SHOT', p: 0.4 },
    { to: 'MIDFIELD', p: 0.6 },
  ],
  DEFENSIVE_BLOCK: [
    { to: 'MIDFIELD', p: 0.7 },
    { to: 'COUNTER', p: 0.3 },
  ],
};

interface RunState {
  current: State;
  elapsedMs: number;
}

/**
 * Markov chain over match-state transitions. Each step advances virtual time
 * by config.stepMs. Engine only knows GoalScored intents; non-goal transitions
 * are walked internally until either GOAL is reached or durationMs exhausts.
 *
 * On GOAL state: emits one TimedEvent with delayMs = stepMs and a randomly
 * selected team from PRESET_TEAMS.
 *
 * Stateful per simulationId. State initialised on tick=0 and removed when
 * match duration exhausts (returns undefined).
 */
export class FastMarkovDynamics implements MatchDynamics {
  private readonly state = new Map<string, RunState>();

  constructor(
    private readonly random: RandomProvider,
    private readonly core: CoreSimulationConfig,
    private readonly config: MarkovDynamicsConfig,
  ) {}

  async nextStep(simulation: Simulation, tickIndex: number): Promise<TimedEvent | undefined> {
    const id = simulation.id.value;

    let st = this.state.get(id);
    if (!st || tickIndex === 0) {
      st = { current: 'MIDFIELD', elapsedMs: 0 };
      this.state.set(id, st);
    }

    // Walk states until GOAL or duration exhausted
    while (st.elapsedMs + this.config.stepMs <= this.core.durationMs) {
      const next = this.pickTransition(st.current);
      st.current = next;
      st.elapsedMs += this.config.stepMs;
      if (next === 'GOAL') {
        const team = PRESET_TEAMS[this.random.int(0, PRESET_TEAMS.length - 1)];
        const intent = new GoalScored(simulation.id, team.id, [], 0, new Date(0));
        return { delayMs: this.config.stepMs, event: intent };
      }
    }

    this.state.delete(id);
    return undefined;
  }

  /** Visible for tests — verifies cleanup discipline. */
  activeStateCount(): number {
    return this.state.size;
  }

  private pickTransition(from: State): State {
    const u = this.random.float();
    let cum = 0;
    const transitions = TRANSITIONS[from];
    for (const t of transitions) {
      cum += t.p;
      if (u < cum) return t.to;
    }
    return transitions[transitions.length - 1].to;
  }
}
