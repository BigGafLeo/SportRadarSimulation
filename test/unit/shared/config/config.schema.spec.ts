import { ConfigSchema } from '@shared/config/config.schema';

describe('ConfigSchema — SIMULATION_PROFILE', () => {
  it('defaults to uniform-realtime', () => {
    const c = ConfigSchema.parse({});
    expect(c.SIMULATION_PROFILE).toBe('uniform-realtime');
  });

  it('accepts each known profile', () => {
    for (const p of ['uniform-realtime', 'poisson-accelerated', 'fast-markov']) {
      const c = ConfigSchema.parse({ SIMULATION_PROFILE: p });
      expect(c.SIMULATION_PROFILE).toBe(p);
    }
  });

  it('rejects unknown profile', () => {
    expect(() => ConfigSchema.parse({ SIMULATION_PROFILE: 'mystery' })).toThrow();
  });
});
