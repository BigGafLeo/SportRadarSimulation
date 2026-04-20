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

describe('ScoreBoard — additional scenarios', () => {
  const germany = Team.create(TeamId.create('germany'), 'Germany');
  const poland = Team.create(TeamId.create('poland'), 'Poland');
  const brazil = Team.create(TeamId.create('brazil'), 'Brazil');
  const argentina = Team.create(TeamId.create('argentina'), 'Argentina');
  const m1 = Match.create(MatchId.create('m1'), germany, poland);
  const m2 = Match.create(MatchId.create('m2'), brazil, argentina);

  it('increment same team multiple times accumulates score cumulatively', () => {
    let sb = ScoreBoard.fromMatches([m1]);
    for (let i = 0; i < 5; i++) {
      sb = sb.increment(TeamId.create('germany'));
    }
    expect(sb.snapshot()).toEqual([{ matchId: 'm1', home: 5, away: 0 }]);
  });

  it('totalGoals sums across multiple increments on different teams', () => {
    const sb = ScoreBoard.fromMatches([m1, m2])
      .increment(TeamId.create('germany'))
      .increment(TeamId.create('germany'))
      .increment(TeamId.create('poland'))
      .increment(TeamId.create('brazil'));
    expect(sb.totalGoals()).toBe(4);
  });

  it('reset returns 0:0 for ALL matches, not just one', () => {
    const sb = ScoreBoard.fromMatches([m1, m2])
      .increment(TeamId.create('germany'))
      .increment(TeamId.create('brazil'))
      .increment(TeamId.create('argentina'));
    const reset = sb.reset();
    expect(reset.snapshot()).toEqual([
      { matchId: 'm1', home: 0, away: 0 },
      { matchId: 'm2', home: 0, away: 0 },
    ]);
    expect(reset.totalGoals()).toBe(0);
  });

  it('snapshot returns array with correct structure for each match', () => {
    const sb = ScoreBoard.fromMatches([m1, m2])
      .increment(TeamId.create('germany'))
      .increment(TeamId.create('argentina'));
    const snap = sb.snapshot();
    expect(snap).toHaveLength(2);
    expect(snap[0]).toEqual({ matchId: 'm1', home: 1, away: 0 });
    expect(snap[1]).toEqual({ matchId: 'm2', home: 0, away: 1 });
  });
});
