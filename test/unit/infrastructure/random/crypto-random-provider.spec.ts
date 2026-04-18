import { CryptoRandomProvider } from '@simulation/infrastructure/random/crypto-random-provider';

describe('CryptoRandomProvider', () => {
  const rng = new CryptoRandomProvider();

  it('int(0, 5) returns inclusive range values', () => {
    const samples = Array.from({ length: 200 }, () => rng.int(0, 5));
    expect(samples.every((v) => v >= 0 && v <= 5 && Number.isInteger(v))).toBe(true);
    expect(new Set(samples).size).toBeGreaterThan(1);
  });

  it('int(min, min) always returns min', () => {
    for (let i = 0; i < 20; i++) {
      expect(rng.int(7, 7)).toBe(7);
    }
  });

  it('int(5, 5) always returns 5', () => {
    for (let i = 0; i < 20; i++) {
      expect(rng.int(5, 5)).toBe(5);
    }
  });

  it('uuid() returns a UUID v4 string', () => {
    const u = rng.uuid();
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('uuid() returns distinct values across calls', () => {
    const a = rng.uuid();
    const b = rng.uuid();
    expect(a).not.toBe(b);
  });

  describe('float()', () => {
    it('returns value in [0, 1)', () => {
      const r = new CryptoRandomProvider();
      for (let i = 0; i < 1000; i++) {
        const v = r.float();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
    it('produces variety (not constant)', () => {
      const r = new CryptoRandomProvider();
      const samples = new Set();
      for (let i = 0; i < 100; i++) samples.add(r.float());
      expect(samples.size).toBeGreaterThan(50);
    });
  });
});
