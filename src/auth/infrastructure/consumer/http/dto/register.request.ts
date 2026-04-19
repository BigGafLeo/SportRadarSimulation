import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export class RegisterRequestDto extends createZodDto(RegisterRequestSchema) {}
