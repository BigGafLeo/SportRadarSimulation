/**
 * Advisory match-wide timing metadata. Used by dynamics to bound their
 * own internal scheduling (Poisson λ rate, Markov max steps).
 */
export interface CoreSimulationConfig {
  readonly durationMs: number;
}
