import type { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';

/**
 * Ignition throttle rule (5s cooldown per token; per-user in Phase 4+).
 * Default impl: FiveSecondCooldownPolicy — Phase 1b.
 */
export interface ThrottlePolicy {
  canIgnite(token: OwnershipToken, lastIgnitionAt: Date | null, now: Date): boolean;
}
