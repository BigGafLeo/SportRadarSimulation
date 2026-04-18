import { PRESET_MATCHES, PRESET_TEAMS } from '@simulation/domain/value-objects/matches-preset';

describe('PRESET_MATCHES', () => {
  it('has exactly 3 matches per PDF requirement', () => {
    expect(PRESET_MATCHES).toHaveLength(3);
  });

  it('has Germany vs Poland', () => {
    const m = PRESET_MATCHES[0];
    expect(m.home.displayName).toBe('Germany');
    expect(m.away.displayName).toBe('Poland');
  });

  it('has Brazil vs Mexico', () => {
    const m = PRESET_MATCHES[1];
    expect(m.home.displayName).toBe('Brazil');
    expect(m.away.displayName).toBe('Mexico');
  });

  it('has Argentina vs Uruguay', () => {
    const m = PRESET_MATCHES[2];
    expect(m.home.displayName).toBe('Argentina');
    expect(m.away.displayName).toBe('Uruguay');
  });

  it('PRESET_TEAMS flattens all 6 teams from 3 matches', () => {
    expect(PRESET_TEAMS).toHaveLength(6);
    expect(PRESET_TEAMS.map((t) => t.id.value)).toEqual([
      'germany',
      'poland',
      'brazil',
      'mexico',
      'argentina',
      'uruguay',
    ]);
  });
});
