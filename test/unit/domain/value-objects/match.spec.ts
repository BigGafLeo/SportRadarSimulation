import { Match } from '@simulation/domain/value-objects/match';
import { MatchId } from '@simulation/domain/value-objects/match-id';
import { Team } from '@simulation/domain/value-objects/team';
import { TeamId } from '@simulation/domain/value-objects/team-id';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('Match', () => {
  const teamA = Team.create(TeamId.create('germany'), 'Germany');
  const teamB = Team.create(TeamId.create('poland'), 'Poland');

  it('creates with id, home, away', () => {
    const m = Match.create(MatchId.create('m1'), teamA, teamB);
    expect(m.id.value).toBe('m1');
    expect(m.home.id.value).toBe('germany');
    expect(m.away.id.value).toBe('poland');
  });

  it('rejects same team playing itself', () => {
    expect(() => Match.create(MatchId.create('m1'), teamA, teamA)).toThrow(InvalidValueError);
  });

  it('teams() returns both teams', () => {
    const m = Match.create(MatchId.create('m1'), teamA, teamB);
    expect(m.teams().map((t) => t.id.value)).toEqual(['germany', 'poland']);
  });

  it('equals() returns true for same match id', () => {
    const m1 = Match.create(MatchId.create('m1'), teamA, teamB);
    const m1copy = Match.create(MatchId.create('m1'), teamA, teamB);
    expect(m1.equals(m1copy)).toBe(true);
  });

  it('equals() returns false for different match id', () => {
    const m1 = Match.create(MatchId.create('m1'), teamA, teamB);
    const m2 = Match.create(MatchId.create('m2'), teamA, teamB);
    expect(m1.equals(m2)).toBe(false);
  });

  it('toJSON() returns correct structure with id, home, and away', () => {
    const m = Match.create(MatchId.create('m1'), teamA, teamB);
    expect(m.toJSON()).toEqual({
      id: 'm1',
      home: { id: 'germany', displayName: 'Germany' },
      away: { id: 'poland', displayName: 'Poland' },
    });
  });
});
