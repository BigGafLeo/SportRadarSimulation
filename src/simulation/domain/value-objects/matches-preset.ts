import { MatchId } from './match-id';
import { TeamId } from './team-id';
import { Team } from './team';
import { Match } from './match';

// PDF requirement: 3 fixed matches
const germany = Team.create(TeamId.create('germany'), 'Germany');
const poland = Team.create(TeamId.create('poland'), 'Poland');
const brazil = Team.create(TeamId.create('brazil'), 'Brazil');
const mexico = Team.create(TeamId.create('mexico'), 'Mexico');
const argentina = Team.create(TeamId.create('argentina'), 'Argentina');
const uruguay = Team.create(TeamId.create('uruguay'), 'Uruguay');

export const PRESET_MATCHES: readonly Match[] = [
  Match.create(MatchId.create('germany-vs-poland'), germany, poland),
  Match.create(MatchId.create('brazil-vs-mexico'), brazil, mexico),
  Match.create(MatchId.create('argentina-vs-uruguay'), argentina, uruguay),
] as const;

export const PRESET_TEAMS: readonly Team[] = PRESET_MATCHES.flatMap((m) => [m.home, m.away]);
