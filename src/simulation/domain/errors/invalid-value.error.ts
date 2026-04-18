import { DomainError } from './domain.error';

export class InvalidValueError extends DomainError {
  constructor(
    public readonly field: string,
    public readonly reason: string,
    public readonly rawValue?: unknown,
  ) {
    super(`Invalid value for ${field}: ${reason}`);
  }
}
