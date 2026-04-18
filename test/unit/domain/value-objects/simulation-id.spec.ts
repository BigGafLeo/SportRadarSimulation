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
});
