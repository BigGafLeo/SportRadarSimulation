import { ScoreBoard } from '@simulation/domain/value-objects/score-board';
import { MatchId } from '@simulation/domain/value-objects/match-id';
import { TeamId } from '@simulation/domain/value-objects/team-id';
import { Team } from '@simulation/domain/value-objects/team';
import { Match } from '@simulation/domain/value-objects/match';

describe('ScoreBoard', () => {
  const germany = Team.create(TeamId.create('germany'), 'Germany');
  const poland = Team.create(TeamId.create('poland'), 'Poland');
  const m1 = Match.create(MatchId.create('m1'), germany, poland);

  it('initializes to 0:0 per match', () => {
    const sb = ScoreBoard.fromMatches([m1]);
    const snapshot = sb.snapshot();
    expect(snapshot).toEqual([{ matchId: 'm1', home: 0, away: 0 }]);
  });

  it('increment returns new ScoreBoard with team goal added', () => {
    const sb = ScoreBoard.fromMatches([m1]);
    const after = sb.increment(TeamId.create('germany'));
    expect(after.snapshot()).toEqual([{ matchId: 'm1', home: 1, away: 0 }]);
    // original unchanged (immutability)
    expect(sb.snapshot()).toEqual([{ matchId: 'm1', home: 0, away: 0 }]);
  });

  it('increment for away team', () => {
    const sb = ScoreBoard.fromMatches([m1]);
    const after = sb.increment(TeamId.create('poland'));
    expect(after.snapshot()).toEqual([{ matchId: 'm1', home: 0, away: 1 }]);
  });

  it('increment for team not in any match throws', () => {
    const sb = ScoreBoard.fromMatches([m1]);
    expect(() => sb.increment(TeamId.create('brazil'))).toThrow();
  });

  it('totalGoals counts across all matches', () => {
    const sb = ScoreBoard.fromMatches([m1]);
    const after = sb
      .increment(TeamId.create('germany'))
      .increment(TeamId.create('poland'))
      .increment(TeamId.create('germany'));
    expect(after.totalGoals()).toBe(3);
  });

  it('reset returns new ScoreBoard with 0:0 for all matches', () => {
    const sb = ScoreBoard.fromMatches([m1]).increment(TeamId.create('germany'));
    const reset = sb.reset();
    expect(reset.snapshot()).toEqual([{ matchId: 'm1', home: 0, away: 0 }]);
    expect(reset.totalGoals()).toBe(0);
  });
});

describe('ScoreBoard.fromSnapshot', () => {
  const germany2 = Team.create(TeamId.create('germany'), 'Germany');
  const poland2 = Team.create(TeamId.create('poland'), 'Poland');
  const m1fs = Match.create(MatchId.create('m1'), germany2, poland2);

  it('reconstructs ScoreBoard from snapshot + matches list', () => {
    const original = ScoreBoard.fromMatches([m1fs]).increment(TeamId.create('germany'));
    const snap = original.snapshot();
    const restored = ScoreBoard.fromSnapshot(snap, [m1fs]);
    expect(restored.snapshot()).toEqual(snap);
    expect(restored.totalGoals()).toBe(1);
  });

  it('throws when snapshot has unknown matchId', () => {
    expect(() =>
      ScoreBoard.fromSnapshot([{ matchId: 'unknown', home: 1, away: 0 }], [m1fs]),
    ).toThrow();
  });
});
