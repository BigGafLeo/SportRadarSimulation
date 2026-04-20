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

  it('rejects email with multiple @ symbols', () => {
    expect(() => Email.create('a@b@c.com')).toThrow();
  });

  it('rejects email without domain part', () => {
    expect(() => Email.create('user@')).toThrow();
  });

  it('accepts email with apostrophe', () => {
    // Zod's .email() allows apostrophes in the local part
    const email = Email.create("o'reilly@example.com");
    expect(email.value).toBe("o'reilly@example.com");
  });

  it('accepts email with plus tag', () => {
    const email = Email.create('user+tag@example.com');
    expect(email.value).toBe('user+tag@example.com');
  });

  it('accepts very long email (>254 chars) — Zod does not enforce RFC 5321 length limit', () => {
    // RFC 5321 limits total email length to 254 chars, but Zod's .email() does not enforce
    // this restriction. The Email VO accepts these values as-is; document this behavior.
    const longEmail = `${'a'.repeat(248)}@x.com`; // 255 chars total
    const email = Email.create(longEmail);
    expect(email.value).toBe(longEmail);
  });
});
