import { Email } from '@auth/domain/value-objects/email';

describe('Email', () => {
  it('creates from valid email and lowercases', () => {
    const email = Email.create('User@Example.COM');
    expect(email.value).toBe('user@example.com');
  });

  it('trims whitespace', () => {
    const email = Email.create('  user@example.com  ');
    expect(email.value).toBe('user@example.com');
  });

  it('throws on invalid email format', () => {
    expect(() => Email.create('not-an-email')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => Email.create('')).toThrow();
  });

  it('equals another Email with same normalized value', () => {
    const a = Email.create('User@Example.com');
    const b = Email.create('user@example.com');
    expect(a.equals(b)).toBe(true);
  });
});
