import { RegisterRequestDto } from '@auth/infrastructure/consumer/http/dto/register.request';

// RegisterRequestSchema: { email: z.string().email(), password: z.string().min(8) }

describe('RegisterRequestDto schema', () => {
  const parse = (input: unknown) => RegisterRequestDto.schema.safeParse(input);

  it('accepts a valid email and password', () => {
    const result = parse({ email: 'user@example.com', password: 'StrongPass1!' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('user@example.com');
      expect(result.data.password).toBe('StrongPass1!');
    }
  });

  it('rejects when email is missing', () => {
    const result = parse({ password: 'StrongPass1!' });
    expect(result.success).toBe(false);
  });

  it('rejects when password is missing', () => {
    const result = parse({ email: 'user@example.com' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email format', () => {
    const result = parse({ email: 'not-an-email', password: 'StrongPass1!' });
    expect(result.success).toBe(false);
  });

  it('rejects password shorter than 8 characters', () => {
    const result = parse({ email: 'user@example.com', password: 'short' });
    expect(result.success).toBe(false);
  });

  it('accepts password of exactly 8 characters (boundary)', () => {
    const result = parse({ email: 'user@example.com', password: '12345678' });
    expect(result.success).toBe(true);
  });

  it('rejects empty object', () => {
    const result = parse({});
    expect(result.success).toBe(false);
  });
});
