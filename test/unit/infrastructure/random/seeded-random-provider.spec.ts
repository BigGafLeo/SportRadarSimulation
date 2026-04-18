import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';

describe('SeededRandomProvider', () => {
  it('produces the same sequence for the same seed (deterministic)', () => {
    const a = new SeededRandomProvider(42);
    const b = new SeededRandomProvider(42);
    const seqA = Array.from({ length: 10 }, () => a.int(0, 100));
    const seqB = Array.from({ length: 10 }, () => b.int(0, 100));
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new SeededRandomProvider(1);
    const b = new SeededRandomProvider(2);
    const seqA = Array.from({ length: 10 }, () => a.int(0, 100));
    const seqB = Array.from({ length: 10 }, () => b.int(0, 100));
    expect(seqA).not.toEqual(seqB);
  });

  it('int values are within inclusive range', () => {
    const rng = new SeededRandomProvider(7);
    const samples = Array.from({ length: 100 }, () => rng.int(-3, 3));
    expect(samples.every((v) => v >= -3 && v <= 3 && Number.isInteger(v))).toBe(true);
  });

  it('uuid() is deterministic per seeded instance', () => {
    const a = new SeededRandomProvider(5);
    const b = new SeededRandomProvider(5);
    expect(a.uuid()).toBe(b.uuid());
    expect(a.uuid()).toBe(b.uuid());
  });

  it('uuid() returns well-formed UUID v4 strings', () => {
    const rng = new SeededRandomProvider(5);
    const u = rng.uuid();
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
