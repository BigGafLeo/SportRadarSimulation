import { ConfigSchema } from '@shared/config/config.schema';

const REQUIRED = { JWT_SECRET: 'test-secret-minimum-32-characters-long-for-hmac' };

describe('ConfigSchema — SIMULATION_PROFILE', () => {
  it('defaults to uniform-realtime', () => {
    const c = ConfigSchema.parse({ ...REQUIRED });
    expect(c.SIMULATION_PROFILE).toBe('uniform-realtime');
  });

  it('accepts each known profile', () => {
    for (const p of ['uniform-realtime', 'poisson-accelerated', 'fast-markov']) {
      const c = ConfigSchema.parse({ ...REQUIRED, SIMULATION_PROFILE: p });
      expect(c.SIMULATION_PROFILE).toBe(p);
    }
  });

  it('rejects unknown profile', () => {
    expect(() => ConfigSchema.parse({ ...REQUIRED, SIMULATION_PROFILE: 'mystery' })).toThrow();
  });
});

describe('ConfigSchema — PERSISTENCE_MODE postgres', () => {
  it('accepts inmemory + postgres, rejects redis', () => {
    expect(() => ConfigSchema.parse({ ...REQUIRED, PERSISTENCE_MODE: 'inmemory' })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...REQUIRED, PERSISTENCE_MODE: 'postgres' })).not.toThrow();
    expect(() => ConfigSchema.parse({ ...REQUIRED, PERSISTENCE_MODE: 'redis' })).toThrow();
  });
});

describe('ConfigSchema — DATABASE_URL', () => {
  it('defaults to local postgres URL', () => {
    const c = ConfigSchema.parse({ ...REQUIRED });
    expect(c.DATABASE_URL).toBe('postgresql://sportradar:sportradar@localhost:5432/sportradar');
  });

  it('accepts custom DATABASE_URL', () => {
    const c = ConfigSchema.parse({
      ...REQUIRED,
      DATABASE_URL: 'postgresql://user:pass@host:5432/db',
    });
    expect(c.DATABASE_URL).toBe('postgresql://user:pass@host:5432/db');
  });

  it('rejects malformed DATABASE_URL', () => {
    expect(() => ConfigSchema.parse({ ...REQUIRED, DATABASE_URL: 'not-a-url' })).toThrow();
  });
});

describe('ConfigSchema — JWT_SECRET', () => {
  it('rejects missing JWT_SECRET', () => {
    expect(() => ConfigSchema.parse({})).toThrow();
  });

  it('rejects JWT_SECRET shorter than 32 chars', () => {
    expect(() => ConfigSchema.parse({ JWT_SECRET: 'too-short' })).toThrow();
  });
});
