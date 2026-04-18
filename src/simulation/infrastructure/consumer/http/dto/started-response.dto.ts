import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { SimulationResponseSchema } from './simulation-response.dto';

export const StartedResponseSchema = z.object({
  simulationId: z.string().uuid(),
  ownershipToken: z.string().uuid(),
  state: z.literal('RUNNING'),
  initialSnapshot: SimulationResponseSchema,
});

export class StartedResponseDto extends createZodDto(StartedResponseSchema) {}
