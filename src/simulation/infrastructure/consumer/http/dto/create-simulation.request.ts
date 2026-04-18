import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { SimulationNameSchema } from '@simulation/domain/value-objects/simulation-name';

export const CreateSimulationRequestSchema = z.object({
  name: SimulationNameSchema,
});

export class CreateSimulationRequestDto extends createZodDto(CreateSimulationRequestSchema) {}
