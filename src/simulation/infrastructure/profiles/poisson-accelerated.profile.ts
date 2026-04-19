import { SystemClock } from '@simulation/infrastructure/time/system-clock';
import { AcceleratedClock } from '@simulation/infrastructure/time/accelerated-clock';
import { PoissonGoalDynamics } from '@simulation/infrastructure/dynamics/poisson-goal-dynamics';
import type { Profile } from './profile';

const NINETY_MIN_MS = 90 * 60 * 1000;
const ACCEL_FACTOR = 600;

export const POISSON_ACCELERATED_PROFILE: Profile = {
  id: 'poisson-accelerated',
  coreConfig: { durationMs: NINETY_MIN_MS },
  dynamicsFactory: ({ random }) =>
    new PoissonGoalDynamics(random, { durationMs: NINETY_MIN_MS }, { goalsPerTeamMean: 2.7 }),
  clockFactory: () => new AcceleratedClock(new SystemClock(), ACCEL_FACTOR),
};
