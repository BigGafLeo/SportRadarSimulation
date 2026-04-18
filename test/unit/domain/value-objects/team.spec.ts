import { Team } from '@simulation/domain/value-objects/team';
import { TeamId } from '@simulation/domain/value-objects/team-id';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('Team', () => {
  it('creates with id and displayName', () => {
    const t = Team.create(TeamId.create('germany'), 'Germany');
    expect(t.id.value).toBe('germany');
    expect(t.displayName).toBe('Germany');
  });

  it('rejects empty displayName', () => {
    expect(() => Team.create(TeamId.create('germany'), '')).toThrow(InvalidValueError);
  });

  it('equality by id only', () => {
    const a = Team.create(TeamId.create('germany'), 'Germany');
    const b = Team.create(TeamId.create('germany'), 'Deutschland');
    expect(a.equals(b)).toBe(true);
  });
});
