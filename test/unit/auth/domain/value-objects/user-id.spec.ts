import { UserId } from '@auth/domain/value-objects/user-id';

describe('UserId', () => {
  it('creates from valid UUID', () => {
    const id = UserId.create('550e8400-e29b-41d4-a716-446655440000');
    expect(id.value).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('throws on non-UUID string', () => {
    expect(() => UserId.create('not-a-uuid')).toThrow('must be UUID');
  });

  it('throws on empty string', () => {
    expect(() => UserId.create('')).toThrow('must be UUID');
  });

  it('equals another UserId with same value', () => {
    const a = UserId.create('550e8400-e29b-41d4-a716-446655440000');
    const b = UserId.create('550e8400-e29b-41d4-a716-446655440000');
    expect(a.equals(b)).toBe(true);
  });

  it('not equal to UserId with different value', () => {
    const a = UserId.create('550e8400-e29b-41d4-a716-446655440000');
    const b = UserId.create('660e8400-e29b-41d4-a716-446655440001');
    expect(a.equals(b)).toBe(false);
  });
});
