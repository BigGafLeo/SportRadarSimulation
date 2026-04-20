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

  it('accepts JWT_SECRET exactly 32 chars (boundary: minimum valid length)', () => {
    const secret32 = 'a'.repeat(32);
    expect(() => ConfigSchema.parse({ JWT_SECRET: secret32 })).not.toThrow();
  });
});

describe('ConfigSchema — JWT_EXPIRES_IN', () => {
  it('rejects JWT_EXPIRES_IN=0 (must be positive integer)', () => {
    expect(() => ConfigSchema.parse({ ...REQUIRED, JWT_EXPIRES_IN: '0' })).toThrow();
  });

  it('accepts JWT_EXPIRES_IN=1 (minimum positive)', () => {
    const c = ConfigSchema.parse({ ...REQUIRED, JWT_EXPIRES_IN: '1' });
    expect(c.JWT_EXPIRES_IN).toBe(1);
  });
});

describe('ConfigSchema — PORT', () => {
  it('rejects PORT=0 (must be positive)', () => {
    expect(() => ConfigSchema.parse({ ...REQUIRED, PORT: '0' })).toThrow();
  });

  it('accepts PORT=65535', () => {
    const c = ConfigSchema.parse({ ...REQUIRED, PORT: '65535' });
    expect(c.PORT).toBe(65535);
  });
});

describe('ConfigSchema — START_COOLDOWN_MS', () => {
  it('accepts START_COOLDOWN_MS=0 (nonnegative boundary)', () => {
    const c = ConfigSchema.parse({ ...REQUIRED, START_COOLDOWN_MS: '0' });
    expect(c.START_COOLDOWN_MS).toBe(0);
  });
});

describe('ConfigSchema — PERSISTENCE_MODE case sensitivity', () => {
  it('rejects "Postgres" (enum is lowercase only)', () => {
    expect(() => ConfigSchema.parse({ ...REQUIRED, PERSISTENCE_MODE: 'Postgres' })).toThrow();
  });
});
