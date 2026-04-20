import { TeamId } from '@simulation/domain/value-objects/team-id';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('TeamId', () => {
  it('creates from non-empty string', () => {
    const id = TeamId.create('germany');
    expect(id.value).toBe('germany');
  });

  it('rejects empty string', () => {
    expect(() => TeamId.create('')).toThrow(InvalidValueError);
  });

  it('rejects whitespace-only string', () => {
    expect(() => TeamId.create('   ')).toThrow(InvalidValueError);
  });

  it('equality compares by value', () => {
    expect(TeamId.create('germany').equals(TeamId.create('germany'))).toBe(true);
    expect(TeamId.create('germany').equals(TeamId.create('poland'))).toBe(false);
  });

  it('toString returns value', () => {
    expect(TeamId.create('germany').toString()).toBe('germany');
  });

  it('rejects whitespace-only string "   "', () => {
    expect(() => TeamId.create('   ')).toThrow(InvalidValueError);
  });

  it('accepts single character — minimum valid id', () => {
    const id = TeamId.create('a');
    expect(id.value).toBe('a');
  });
});
