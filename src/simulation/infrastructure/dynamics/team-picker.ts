import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import { PRESET_TEAMS } from '@simulation/domain/value-objects/matches-preset';
import type { Team } from '@simulation/domain/value-objects/team';

/**
 * Uniform team selection across all preset teams. Shared by all dynamics.
 * A simulation aggregate owns all 3 PRESET_MATCHES (6 teams total) — any
 * goal can be scored by any of them.
 */
export function pickRandomTeam(random: RandomProvider): Team {
  return PRESET_TEAMS[random.int(0, PRESET_TEAMS.length - 1)];
}
