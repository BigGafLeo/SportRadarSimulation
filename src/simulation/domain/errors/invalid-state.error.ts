import { DomainError } from './domain.error';

export type SimulationState = 'RUNNING' | 'FINISHED';

export class InvalidStateError extends DomainError {
  constructor(
    public readonly currentState: SimulationState,
    public readonly attemptedAction: string,
  ) {
    super(`Cannot ${attemptedAction} simulation in state ${currentState}`);
  }
}
