import { z } from 'zod';
import { InvalidValueError } from '../errors/invalid-value.error';

const MatchIdSchema = z
  .string()
  .min(1)
  .refine((s) => s.trim().length > 0, 'whitespace-only');

export class MatchId {
  private constructor(public readonly value: string) {}

  static create(raw: string): MatchId {
    const parsed = MatchIdSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidValueError('MatchId', parsed.error.issues[0]?.message ?? 'invalid', raw);
    }
    return new MatchId(parsed.data);
  }

  equals(other: MatchId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
