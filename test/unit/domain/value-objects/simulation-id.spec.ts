import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('SimulationId', () => {
  it('creates from UUID v4 string', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(SimulationId.create(uuid).value).toBe(uuid);
  });

  it('rejects non-UUID string', () => {
    expect(() => SimulationId.create('not-a-uuid')).toThrow(InvalidValueError);
  });

  it('rejects empty string', () => {
    expect(() => SimulationId.create('')).toThrow(InvalidValueError);
  });

  it('equality by value', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(SimulationId.create(uuid).equals(SimulationId.create(uuid))).toBe(true);
  });

  it('toString returns value', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(SimulationId.create(uuid).toString()).toBe(uuid);
  });

  it('accepts uppercase UUID (Zod uuid() is case-insensitive)', () => {
    const upper = '550E8400-E29B-41D4-A716-446655440000';
    expect(() => SimulationId.create(upper)).not.toThrow();
    expect(SimulationId.create(upper).value).toBe(upper);
  });

  it('rejects UUID with surrounding whitespace', () => {
    expect(() => SimulationId.create(' 550e8400-e29b-41d4-a716-446655440000 ')).toThrow(
      InvalidValueError,
    );
  });
});
