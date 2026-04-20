import { LoginRequestDto } from '@auth/infrastructure/consumer/http/dto/login.request';

// LoginRequestSchema: { email: z.string().email(), password: z.string().min(1) }

describe('LoginRequestDto schema', () => {
  const parse = (input: unknown) => LoginRequestDto.schema.safeParse(input);

  it('accepts a valid email and password', () => {
    const result = parse({ email: 'user@example.com', password: 'AnyPass!' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
      expect(result.data.password).toBe('AnyPass!');
    }
  });

  it('rejects when email is missing', () => {
    const result = parse({ password: 'AnyPass!' });
    expect(result.success).toBe(false);
  });

  it('rejects when password is missing', () => {
    const result = parse({ email: 'user@example.com' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = parse({ email: 'not-an-email', password: 'AnyPass!' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password string (min(1))', () => {
    const result = parse({ email: 'user@example.com', password: '' });
    expect(result.success).toBe(false);
  });

  it('accepts single-character password (boundary — min is 1)', () => {
    const result = parse({ email: 'user@example.com', password: 'x' });
    expect(result.success).toBe(true);
  });

  it('rejects empty object', () => {
    const result = parse({});
    expect(result.success).toBe(false);
  });
});
