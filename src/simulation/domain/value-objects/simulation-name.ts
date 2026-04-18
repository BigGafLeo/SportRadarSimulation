import { z } from 'zod';
import { InvalidValueError } from '../errors/invalid-value.error';

// D10: Unicode letters + digits + ASCII space only (no tab, newline, non-breaking space)
const NAME_PATTERN = /^[\p{L}\p{N} ]{8,30}$/u;

export const SimulationNameSchema = z
  .string()
  .regex(NAME_PATTERN, 'must be 8-30 unicode letters/digits/spaces')
  .refine(
    (s) => s === s.trimStart() && s === s.trimEnd(),
    'leading/trailing whitespace not allowed',
  );

export class SimulationName {
  private constructor(public readonly value: string) {}

  static create(raw: string): SimulationName {
    const parsed = SimulationNameSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidValueError(
        'SimulationName',
        parsed.error.issues[0]?.message ?? 'invalid',
        raw,
      );
    }
    return new SimulationName(parsed.data);
  }

  equals(other: SimulationName): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
