import { DomainError } from '@simulation/domain/errors/domain.error';

export class SimulationNotFoundError extends DomainError {
  constructor(public readonly simulationId: string) {
    super(`Simulation not found: ${simulationId}`);
  }
}

export class OwnershipMismatchError extends DomainError {
  constructor(public readonly simulationId: string) {
    super(`User does not own simulation ${simulationId}`);
  }
}

export class ThrottledError extends DomainError {
  constructor(public readonly cooldownMs: number) {
    super(`Start rejected: cooldown ${cooldownMs}ms not elapsed`);
  }
}
