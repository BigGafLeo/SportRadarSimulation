import type { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from '@simulation/infrastructure/consumer/http/domain-exception.filter';
import { InvalidStateError } from '@simulation/domain/errors/invalid-state.error';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';
import {
  SimulationNotFoundError,
  OwnershipMismatchError,
  ThrottledError,
  UnknownTokenError,
} from '@simulation/application/orchestrator/orchestrator.errors';

interface MockResponse {
  status: (code: number) => MockResponse;
  json: (body: unknown) => void;
  _status?: number;
  _body?: unknown;
}

function mockHost(): { response: MockResponse; host: ArgumentsHost } {
  const response: MockResponse = {
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  };
  return { response, host: host as unknown as ArgumentsHost };
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it('maps InvalidValueError → 400', () => {
    const { response, host } = mockHost();
    filter.catch(new InvalidValueError('name', 'too short', 'abc'), host);
    expect(response._status).toBe(400);
    expect(response._body).toMatchObject({
      error: { code: 'INVALID_VALUE', field: 'name' },
    });
  });

  it('maps InvalidStateError → 409', () => {
    const { response, host } = mockHost();
    filter.catch(new InvalidStateError('FINISHED', 'apply goal to'), host);
    expect(response._status).toBe(409);
    expect(response._body).toMatchObject({
      error: { code: 'INVALID_STATE' },
    });
  });

  it('maps SimulationNotFoundError → 404', () => {
    const { response, host } = mockHost();
    filter.catch(new SimulationNotFoundError('abc'), host);
    expect(response._status).toBe(404);
    expect(response._body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('maps OwnershipMismatchError → 403', () => {
    const { response, host } = mockHost();
    filter.catch(new OwnershipMismatchError('abc'), host);
    expect(response._status).toBe(403);
  });

  it('maps ThrottledError → 429', () => {
    const { response, host } = mockHost();
    filter.catch(new ThrottledError(5000), host);
    expect(response._status).toBe(429);
  });

  it('maps UnknownTokenError → 401', () => {
    const { response, host } = mockHost();
    filter.catch(new UnknownTokenError('abc'), host);
    expect(response._status).toBe(401);
  });

  it('unknown domain error falls through to 500', () => {
    class CustomError extends Error {
      constructor() {
        super('custom');
      }
    }
    const { response, host } = mockHost();
    filter.catch(new CustomError(), host);
    expect(response._status).toBe(500);
    expect(response._body).toMatchObject({ error: { code: 'INTERNAL' } });
  });
});
