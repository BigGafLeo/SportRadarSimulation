import type { MatchId } from './match-id';
import type { Team } from './team';
import { InvalidValueError } from '../errors/invalid-value.error';

export class Match {
  private constructor(
    public readonly id: MatchId,
    public readonly home: Team,
    public readonly away: Team,
  ) {}

  static create(id: MatchId, home: Team, away: Team): Match {
    if (home.id.equals(away.id)) {
      throw new InvalidValueError('Match', 'home and away teams must differ', {
        home: home.id.value,
        away: away.id.value,
      });
    }
    return new Match(id, home, away);
  }

  teams(): readonly [Team, Team] {
    return [this.home, this.away];
  }

  equals(other: Match): boolean {
    return this.id.equals(other.id);
  }

  toJSON(): { id: string; home: ReturnType<Team['toJSON']>; away: ReturnType<Team['toJSON']> } {
    return { id: this.id.value, home: this.home.toJSON(), away: this.away.toJSON() };
  }
}
