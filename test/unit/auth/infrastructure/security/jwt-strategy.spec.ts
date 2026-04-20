import { JwtStrategy } from '@auth/infrastructure/security/jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = new JwtStrategy('test-secret-minimum-32-chars-long!!');
  });

  describe('validate()', () => {
    it('returns AuthenticatedUser with id and email for valid payload', () => {
      const payload = { sub: '550e8400-e29b-41d4-a716-446655440000', email: 'user@example.com' };
      const result = strategy.validate(payload);
      expect(result).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'user@example.com',
      });
    });

    it('maps payload.sub to result.id', () => {
      const payload = { sub: 'some-user-id', email: 'a@b.com' };
      const result = strategy.validate(payload);
      expect(result.id).toBe('some-user-id');
    });

    it('maps payload.email to result.email', () => {
      const payload = { sub: 'some-user-id', email: 'mapped@example.com' };
      const result = strategy.validate(payload);
      expect(result.email).toBe('mapped@example.com');
    });

    it('validate() with missing sub returns undefined id', () => {
      // TypeScript signature requires both, but at runtime Passport can pass partial payloads
      const payload = { sub: undefined as unknown as string, email: 'a@b.com' };
      const result = strategy.validate(payload);
      expect(result.id).toBeUndefined();
    });

    it('validate() with missing email returns undefined email', () => {
      const payload = { sub: 'some-id', email: undefined as unknown as string };
      const result = strategy.validate(payload);
      expect(result.email).toBeUndefined();
    });
  });
});
