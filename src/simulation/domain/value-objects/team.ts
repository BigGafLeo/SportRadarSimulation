import { z } from 'zod';
import type { TeamId } from './team-id';
import { InvalidValueError } from '../errors/invalid-value.error';

const DisplayNameSchema = z
  .string()
  .min(1)
  .refine((s) => s.trim().length > 0, 'whitespace-only');

export class Team {
  private constructor(
    public readonly id: TeamId,
    public readonly displayName: string,
  ) {}

  static create(id: TeamId, displayName: string): Team {
    const parsed = DisplayNameSchema.safeParse(displayName);
    if (!parsed.success) {
      throw new InvalidValueError(
        'Team.displayName',
        parsed.error.issues[0]?.message ?? 'invalid',
        displayName,
      );
    }
    return new Team(id, parsed.data);
  }

  equals(other: Team): boolean {
    return this.id.equals(other.id);
  }

  toJSON(): { id: string; displayName: string } {
    return { id: this.id.value, displayName: this.displayName };
  }
}
