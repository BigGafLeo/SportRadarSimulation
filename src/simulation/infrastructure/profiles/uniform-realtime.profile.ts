import { SystemClock } from '@simulation/infrastructure/time/system-clock';
import { UniformRandomGoalDynamics } from '@simulation/infrastructure/dynamics/uniform-random-goal-dynamics';
import type { Profile } from './profile';

export const UNIFORM_REALTIME_PROFILE: Profile = {
  id: 'uniform-realtime',
  coreConfig: { durationMs: 9000 },
  dynamicsFactory: ({ random }) =>
    new UniformRandomGoalDynamics(random, {
      goalCount: 9,
      goalIntervalMs: 1000,
      firstGoalOffsetMs: 1000,
    }),
  clockFactory: () => new SystemClock(),
};
