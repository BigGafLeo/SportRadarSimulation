import type { Clock } from '@simulation/domain/ports/clock.port';
import type { MatchDynamics } from '@simulation/domain/ports/match-dynamics.port';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { CoreSimulationConfig } from '@simulation/domain/core-simulation-config';

export interface ProfileDynamicsDeps {
  readonly random: RandomProvider;
}

export interface Profile {
  readonly id: string;
  readonly coreConfig: CoreSimulationConfig;
  readonly dynamicsFactory: (deps: ProfileDynamicsDeps) => MatchDynamics;
  readonly clockFactory: () => Clock;
}
