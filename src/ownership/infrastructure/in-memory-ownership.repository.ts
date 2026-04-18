import type {
  OwnershipRecord,
  OwnershipRepository,
} from '@ownership/domain/ports/ownership-repository.port';
import type { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';

export class InMemoryOwnershipRepository implements OwnershipRepository {
  private readonly store = new Map<string, OwnershipRecord>();

  async save(record: OwnershipRecord): Promise<void> {
    this.store.set(record.token.value, { ...record });
  }

  async findByToken(token: OwnershipToken): Promise<OwnershipRecord | null> {
    return this.store.get(token.value) ?? null;
  }

  async updateLastIgnitionAt(token: OwnershipToken, now: Date): Promise<void> {
    const existing = this.store.get(token.value);
    if (!existing) {
      throw new Error(`OwnershipToken not found: ${token.value}`);
    }
    this.store.set(token.value, { ...existing, lastIgnitionAt: now });
  }
}
