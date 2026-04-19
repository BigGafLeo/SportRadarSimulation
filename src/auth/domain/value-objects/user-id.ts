import { z } from 'zod';

const UserIdSchema = z.string().uuid();

export class UserId {
  private constructor(public readonly value: string) {}

  static create(raw: string): UserId {
    const parsed = UserIdSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`UserId: must be UUID, got "${raw}"`);
    }
    return new UserId(parsed.data);
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
