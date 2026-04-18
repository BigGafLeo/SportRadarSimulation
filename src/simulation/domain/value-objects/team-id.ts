import { z } from 'zod';
import { InvalidValueError } from '../errors/invalid-value.error';

const TeamIdSchema = z
  .string()
  .min(1)
  .refine((s) => s.trim().length > 0, 'whitespace-only');

export class TeamId {
  private constructor(public readonly value: string) {}

  static create(raw: string): TeamId {
    const parsed = TeamIdSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidValueError('TeamId', parsed.error.issues[0]?.message ?? 'invalid', raw);
    }
    return new TeamId(parsed.data);
  }

  equals(other: TeamId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
