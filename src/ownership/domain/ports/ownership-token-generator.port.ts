import type { OwnershipToken } from '../value-objects/ownership-token';

/**
 * Token generation port (UUID v4 in Phase 1, JWT in Phase 4+).
 * Default impl: UuidTokenGenerator — Phase 1b.
 */
export interface OwnershipTokenGenerator {
  generate(): OwnershipToken;
}
