import { z } from 'zod';
import { InvalidValueError } from '../errors/invalid-value.error';

const SimulationIdSchema = z.string().uuid();

export class SimulationId {
  private constructor(public readonly value: string) {}

  static create(raw: string): SimulationId {
    const parsed = SimulationIdSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidValueError('SimulationId', 'must be UUID v4', raw);
    }
    return new SimulationId(parsed.data);
  }

  equals(other: SimulationId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
