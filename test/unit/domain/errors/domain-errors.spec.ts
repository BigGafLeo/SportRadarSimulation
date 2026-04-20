import { DomainError } from '@simulation/domain/errors/domain.error';
import { InvalidStateError } from '@simulation/domain/errors/invalid-state.error';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

// Concrete subclass for testing the abstract DomainError base
class ConcreteDomainError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

describe('DomainError (base)', () => {
  it('is an instance of Error', () => {
    const err = new ConcreteDomainError('something went wrong');
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of DomainError', () => {
    const err = new ConcreteDomainError('something went wrong');
    expect(err).toBeInstanceOf(DomainError);
  });

  it('sets message correctly', () => {
    const err = new ConcreteDomainError('something went wrong');
    expect(err.message).toBe('something went wrong');
  });

  it('sets name to the concrete class name (not DomainError)', () => {
    const err = new ConcreteDomainError('something went wrong');
    expect(err.name).toBe('ConcreteDomainError');
  });

  it('has a stack trace', () => {
    const err = new ConcreteDomainError('trace test');
    expect(err.stack).toBeDefined();
  });
});

describe('InvalidStateError', () => {
  it('is an instance of DomainError and Error', () => {
    const err = new InvalidStateError('FINISHED', 'apply goal to');
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of InvalidStateError', () => {
    const err = new InvalidStateError('FINISHED', 'apply goal to');
    expect(err).toBeInstanceOf(InvalidStateError);
  });

  it('formats message as "Cannot <action> simulation in state <state>"', () => {
    const err = new InvalidStateError('FINISHED', 'apply goal to');
    expect(err.message).toBe('Cannot apply goal to simulation in state FINISHED');
  });

  it('stores currentState', () => {
    const err = new InvalidStateError('RUNNING', 'restart');
    expect(err.currentState).toBe('RUNNING');
  });

  it('stores attemptedAction', () => {
    const err = new InvalidStateError('RUNNING', 'restart');
    expect(err.attemptedAction).toBe('restart');
  });

  it('sets name to InvalidStateError', () => {
    const err = new InvalidStateError('FINISHED', 'finish');
    expect(err.name).toBe('InvalidStateError');
  });

  it('works with RUNNING state', () => {
    const err = new InvalidStateError('RUNNING', 'restart');
    expect(err.message).toBe('Cannot restart simulation in state RUNNING');
  });

  it('works with FINISHED state', () => {
    const err = new InvalidStateError('FINISHED', 'finish');
    expect(err.message).toBe('Cannot finish simulation in state FINISHED');
  });
});

describe('InvalidValueError', () => {
  it('is an instance of DomainError and Error', () => {
    const err = new InvalidValueError('field', 'reason');
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(Error);
  });

  it('is an instance of InvalidValueError', () => {
    const err = new InvalidValueError('field', 'reason');
    expect(err).toBeInstanceOf(InvalidValueError);
  });

  it('formats message as "Invalid value for <field>: <reason>"', () => {
    const err = new InvalidValueError('SimulationId', 'must be UUID v4');
    expect(err.message).toBe('Invalid value for SimulationId: must be UUID v4');
  });

  it('stores field', () => {
    const err = new InvalidValueError('SimulationName', 'too short');
    expect(err.field).toBe('SimulationName');
  });

  it('stores reason', () => {
    const err = new InvalidValueError('SimulationName', 'too short');
    expect(err.reason).toBe('too short');
  });

  it('rawValue is undefined when not provided', () => {
    const err = new InvalidValueError('field', 'reason');
    expect(err.rawValue).toBeUndefined();
  });

  it('stores rawValue when provided as string', () => {
    const err = new InvalidValueError('SimulationId', 'must be UUID v4', 'not-a-uuid');
    expect(err.rawValue).toBe('not-a-uuid');
  });

  it('stores rawValue when provided as number', () => {
    const err = new InvalidValueError('score', 'must be non-negative', -1);
    expect(err.rawValue).toBe(-1);
  });

  it('stores rawValue when provided as object', () => {
    const raw = { home: 'a', away: 'a' };
    const err = new InvalidValueError('Match', 'teams must differ', raw);
    expect(err.rawValue).toEqual(raw);
  });

  it('sets name to InvalidValueError', () => {
    const err = new InvalidValueError('field', 'reason');
    expect(err.name).toBe('InvalidValueError');
  });
});
