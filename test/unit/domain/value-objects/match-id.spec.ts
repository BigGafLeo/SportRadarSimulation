import { MatchId } from '@simulation/domain/value-objects/match-id';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('MatchId', () => {
  it('creates from non-empty string', () => {
    expect(MatchId.create('germany-vs-poland').value).toBe('germany-vs-poland');
  });

  it('rejects empty', () => {
    expect(() => MatchId.create('')).toThrow(InvalidValueError);
  });

  it('equality by value', () => {
    expect(MatchId.create('m1').equals(MatchId.create('m1'))).toBe(true);
  });

  it('rejects whitespace-only string', () => {
    expect(() => MatchId.create('   ')).toThrow(InvalidValueError);
  });
});
