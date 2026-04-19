import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export class LoginRequestDto extends createZodDto(LoginRequestSchema) {}
