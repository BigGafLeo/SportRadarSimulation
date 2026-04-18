import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('OwnershipToken', () => {
  it('creates from UUID v4', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(OwnershipToken.create(uuid).value).toBe(uuid);
  });

  it('rejects non-UUID', () => {
    expect(() => OwnershipToken.create('not-a-uuid')).toThrow(InvalidValueError);
  });

  it('rejects empty', () => {
    expect(() => OwnershipToken.create('')).toThrow(InvalidValueError);
  });

  it('equality by value', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(OwnershipToken.create(uuid).equals(OwnershipToken.create(uuid))).toBe(true);
  });

  it('toString returns value', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(OwnershipToken.create(uuid).toString()).toBe(uuid);
  });
});
