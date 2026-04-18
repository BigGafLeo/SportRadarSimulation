import { z } from 'zod';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

const OwnershipTokenSchema = z.string().uuid();

export class OwnershipToken {
  private constructor(public readonly value: string) {}

  static create(raw: string): OwnershipToken {
    const parsed = OwnershipTokenSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidValueError('OwnershipToken', 'must be UUID v4', raw);
    }
    return new OwnershipToken(parsed.data);
  }

  equals(other: OwnershipToken): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
