import type { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from '@simulation/infrastructure/consumer/http/domain-exception.filter';
import { DomainError } from '@simulation/domain/errors/domain.error';
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

  it('unknown DomainError subclass rethrows for NestJS default handler', () => {
    // Filter is @Catch(DomainError) — non-DomainError like HttpException bypass it
    // and go to NestJS default. An unknown DomainError subclass rethrows so the
    // default handler still emits 500.
    class CustomDomainError extends DomainError {
      constructor() {
        super('custom');
      }
    }
    const { host } = mockHost();
    expect(() => filter.catch(new CustomDomainError(), host)).toThrow(CustomDomainError);
  });

  it('InvalidValueError response body has error.code and error.message', () => {
    const { response, host } = mockHost();
    filter.catch(new InvalidValueError('name', 'too short', 'abc'), host);
    const body = response._body as { error: { code: string; message: string } };
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('code', 'INVALID_VALUE');
    expect(body.error).toHaveProperty('message');
    expect(typeof body.error.message).toBe('string');
    expect(body.error.message.length).toBeGreaterThan(0);
  });
});
