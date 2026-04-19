/**
 * Standard football match duration. Used by Poisson and Markov profiles to bound
 * their virtual-time scheduling. AcceleratedClock(factor) compresses this to
 * wall-clock at runtime.
 */
export const FOOTBALL_MATCH_DURATION_MS = 90 * 60 * 1000;
