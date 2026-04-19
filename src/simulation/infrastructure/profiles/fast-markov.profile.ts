import { SystemClock } from '@simulation/infrastructure/time/system-clock';
import { AcceleratedClock } from '@simulation/infrastructure/time/accelerated-clock';
import { FastMarkovDynamics } from '@simulation/infrastructure/dynamics/fast-markov-dynamics';
import { FOOTBALL_MATCH_DURATION_MS } from '@simulation/domain/value-objects/match-constants';
import type { Profile } from './profile';

const ACCEL_FACTOR = 1000;
const STEP_MS = 1000;

const coreConfig = { durationMs: FOOTBALL_MATCH_DURATION_MS };

export const FAST_MARKOV_PROFILE: Profile = {
  id: 'fast-markov',
  coreConfig,
  dynamicsFactory: ({ random }) => new FastMarkovDynamics(random, coreConfig, { stepMs: STEP_MS }),
  clockFactory: () => new AcceleratedClock(new SystemClock(), ACCEL_FACTOR),
};
