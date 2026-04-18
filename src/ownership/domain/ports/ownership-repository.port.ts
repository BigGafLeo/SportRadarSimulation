import type { OwnershipToken } from '../value-objects/ownership-token';

export interface OwnershipRecord {
  readonly token: OwnershipToken;
  readonly createdAt: Date;
  readonly lastIgnitionAt: Date | null;
}

/**
 * Ownership token persistence port.
 * Default impl: InMemoryOwnershipRepository — Phase 1b.
 */
export interface OwnershipRepository {
  save(record: OwnershipRecord): Promise<void>;
  findByToken(token: OwnershipToken): Promise<OwnershipRecord | null>;
  updateLastIgnitionAt(token: OwnershipToken, now: Date): Promise<void>;
}
