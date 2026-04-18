import type { Match } from './match';
import type { TeamId } from './team-id';
import { InvalidValueError } from '../errors/invalid-value.error';

export interface MatchScoreSnapshot {
  readonly matchId: string;
  readonly home: number;
  readonly away: number;
}

interface MatchScore {
  readonly match: Match;
  readonly home: number;
  readonly away: number;
}

export class ScoreBoard {
  private constructor(private readonly scores: readonly MatchScore[]) {}

  static fromMatches(matches: readonly Match[]): ScoreBoard {
    return new ScoreBoard(matches.map((match) => ({ match, home: 0, away: 0 })));
  }

  increment(teamId: TeamId): ScoreBoard {
    const updated = this.scores.map((entry) => {
      if (entry.match.home.id.equals(teamId)) {
        return { ...entry, home: entry.home + 1 };
      }
      if (entry.match.away.id.equals(teamId)) {
        return { ...entry, away: entry.away + 1 };
      }
      return entry;
    });
    if (updated.every((entry, i) => entry === this.scores[i])) {
      throw new InvalidValueError('ScoreBoard.increment', 'team not in any match', teamId.value);
    }
    return new ScoreBoard(updated);
  }

  totalGoals(): number {
    return this.scores.reduce((sum, entry) => sum + entry.home + entry.away, 0);
  }

  reset(): ScoreBoard {
    return new ScoreBoard(this.scores.map((entry) => ({ ...entry, home: 0, away: 0 })));
  }

  snapshot(): MatchScoreSnapshot[] {
    return this.scores.map((entry) => ({
      matchId: entry.match.id.value,
      home: entry.home,
      away: entry.away,
    }));
  }

  matches(): readonly Match[] {
    return this.scores.map((entry) => entry.match);
  }
}
