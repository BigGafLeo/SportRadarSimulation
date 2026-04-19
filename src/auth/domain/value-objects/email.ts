import { z } from 'zod';

const EmailSchema = z.string().trim().toLowerCase().email();

export class Email {
  private constructor(public readonly value: string) {}

  static create(raw: string): Email {
    const parsed = EmailSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Email: invalid format, got "${raw}"`);
    }
    return new Email(parsed.data);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
