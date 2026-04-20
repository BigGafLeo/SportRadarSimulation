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

  it('accepts uppercase UUID (Zod uuid is case-insensitive)', () => {
    const id = UserId.create('550E8400-E29B-41D4-A716-446655440000');
    // Zod .uuid() accepts uppercase; value is stored as-is (not lowercased)
    expect(id.value).toBe('550E8400-E29B-41D4-A716-446655440000');
  });

  it('accepts nil UUID (all zeros is a valid UUID format)', () => {
    const id = UserId.create('00000000-0000-0000-0000-000000000000');
    expect(id.value).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('rejects UUID without dashes', () => {
    expect(() => UserId.create('550e8400e29b41d4a716446655440000')).toThrow('must be UUID');
  });
});
