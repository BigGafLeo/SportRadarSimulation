import { SystemClock } from '@simulation/infrastructure/time/system-clock';
import { AcceleratedClock } from '@simulation/infrastructure/time/accelerated-clock';
import { PoissonGoalDynamics } from '@simulation/infrastructure/dynamics/poisson-goal-dynamics';
import { FOOTBALL_MATCH_DURATION_MS } from '@simulation/domain/value-objects/match-constants';
import type { Profile } from './profile';

const ACCEL_FACTOR = 600;
// 2.7 goals per team per 90-min match — Premier League historical average,
// standard input for Dixon-Coles-style Poisson modeling used by sports analytics.
const GOALS_PER_TEAM_MEAN = 2.7;

const coreConfig = { durationMs: FOOTBALL_MATCH_DURATION_MS };

export const POISSON_ACCELERATED_PROFILE: Profile = {
  id: 'poisson-accelerated',
  coreConfig,
  dynamicsFactory: ({ random }) =>
    new PoissonGoalDynamics(random, coreConfig, { goalsPerTeamMean: GOALS_PER_TEAM_MEAN }),
  clockFactory: () => new AcceleratedClock(new SystemClock(), ACCEL_FACTOR),
};
