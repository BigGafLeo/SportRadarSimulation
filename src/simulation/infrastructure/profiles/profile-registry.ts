import type { Profile } from './profile';
import { UNIFORM_REALTIME_PROFILE } from './uniform-realtime.profile';
import { POISSON_ACCELERATED_PROFILE } from './poisson-accelerated.profile';
import { FAST_MARKOV_PROFILE } from './fast-markov.profile';

export const PROFILES: Readonly<Record<string, Profile>> = Object.freeze({
  [UNIFORM_REALTIME_PROFILE.id]: UNIFORM_REALTIME_PROFILE,
  [POISSON_ACCELERATED_PROFILE.id]: POISSON_ACCELERATED_PROFILE,
  [FAST_MARKOV_PROFILE.id]: FAST_MARKOV_PROFILE,
});

export const PROFILE_IDS: readonly string[] = Object.freeze(Object.keys(PROFILES));

export const DEFAULT_PROFILE_ID = UNIFORM_REALTIME_PROFILE.id;

export function getProfile(id: string): Profile {
  const p = PROFILES[id];
  if (!p) {
    throw new Error(`Unknown profile: "${id}". Available: ${PROFILE_IDS.join(', ')}`);
  }
  return p;
}
