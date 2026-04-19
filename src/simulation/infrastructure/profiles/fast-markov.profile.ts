import { SystemClock } from '@simulation/infrastructure/time/system-clock';
import { AcceleratedClock } from '@simulation/infrastructure/time/accelerated-clock';
import { FastMarkovDynamics } from '@simulation/infrastructure/dynamics/fast-markov-dynamics';
import type { Profile } from './profile';

const MATCH_DURATION_MS = 90 * 60 * 1000;
const ACCEL_FACTOR = 1000;
const STEP_MS = 1000;

export const FAST_MARKOV_PROFILE: Profile = {
  id: 'fast-markov',
  coreConfig: { durationMs: MATCH_DURATION_MS },
  dynamicsFactory: ({ random }) =>
    new FastMarkovDynamics(random, { durationMs: MATCH_DURATION_MS }, { stepMs: STEP_MS }),
  clockFactory: () => new AcceleratedClock(new SystemClock(), ACCEL_FACTOR),
};
