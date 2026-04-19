/**
 * Ignition throttle rule (5s cooldown per user; per-user in Phase 4+).
 * Default impl: FiveSecondCooldownPolicy — Phase 1b.
 */
export interface ThrottlePolicy {
  // userId retained for future per-user rate limiting (e.g. premium tiers with different cooldowns)
  canIgnite(userId: string, lastIgnitionAt: Date | null, now: Date): boolean;
}
