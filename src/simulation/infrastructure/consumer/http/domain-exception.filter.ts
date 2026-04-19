import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { DomainError } from '@simulation/domain/errors/domain.error';
import { InvalidStateError } from '@simulation/domain/errors/invalid-state.error';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';
import {
  SimulationNotFoundError,
  OwnershipMismatchError,
  ThrottledError,
} from '@simulation/application/orchestrator/orchestrator.errors';

interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly [key: string]: unknown;
  };
}

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter<DomainError> {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status: (code: number) => { json: (body: ErrorBody) => void };
    }>();

    if (exception instanceof InvalidValueError) {
      response.status(400).json({
        error: {
          code: 'INVALID_VALUE',
          message: exception.message,
          field: exception.field,
          reason: exception.reason,
        },
      });
      return;
    }
    if (exception instanceof InvalidStateError) {
      response.status(409).json({
        error: {
          code: 'INVALID_STATE',
          message: exception.message,
          currentState: exception.currentState,
          attemptedAction: exception.attemptedAction,
        },
      });
      return;
    }
    if (exception instanceof SimulationNotFoundError) {
      response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: exception.message,
          simulationId: exception.simulationId,
        },
      });
      return;
    }
    if (exception instanceof OwnershipMismatchError) {
      response.status(403).json({
        error: { code: 'FORBIDDEN', message: exception.message },
      });
      return;
    }
    if (exception instanceof ThrottledError) {
      response.status(429).json({
        error: {
          code: 'THROTTLED',
          message: exception.message,
          cooldownMs: exception.cooldownMs,
        },
      });
      return;
    }
    // Unknown DomainError subclass: rethrow so NestJS default handler emits 500.
    throw exception;
  }
}
