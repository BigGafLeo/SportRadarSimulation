import { pickRandomTeam } from '@simulation/infrastructure/dynamics/team-picker';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { CryptoRandomProvider } from '@simulation/infrastructure/random/crypto-random-provider';
import { PRESET_TEAMS } from '@simulation/domain/value-objects/matches-preset';

describe('pickRandomTeam', () => {
  it('returns a team that belongs to PRESET_TEAMS', () => {
    const rng = new SeededRandomProvider(42);
    const team = pickRandomTeam(rng);
    const validIds = PRESET_TEAMS.map((t) => t.id.value);
    expect(validIds).toContain(team.id.value);
  });

  it('returns a deterministic team for a fixed seed', () => {
    const rngA = new SeededRandomProvider(42);
    const rngB = new SeededRandomProvider(42);
    const teamA = pickRandomTeam(rngA);
    const teamB = pickRandomTeam(rngB);
    expect(teamA.id.value).toBe(teamB.id.value);
  });

  it('distribution across many calls covers all 6 PRESET_TEAMS', () => {
    // Use CryptoRandomProvider for a statistical spread test.
    const rng = new CryptoRandomProvider();
    const seen = new Set<string>();
    // 600 draws; P(missing any one of 6 teams) ≈ 6*(5/6)^600 ≈ 0
    for (let i = 0; i < 600; i++) {
      seen.add(pickRandomTeam(rng).id.value);
    }
    expect(seen.size).toBe(PRESET_TEAMS.length);
  });
});
