import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { SimulationNameSchema } from '@simulation/domain/value-objects/simulation-name';
import {
  PROFILE_IDS,
  DEFAULT_PROFILE_ID,
} from '@simulation/infrastructure/profiles/profile-registry';

const ProfileSchema = z.enum(PROFILE_IDS as [string, ...string[]]).default(DEFAULT_PROFILE_ID);

export const CreateSimulationRequestSchema = z.object({
  name: SimulationNameSchema,
  profile: ProfileSchema,
});

export class CreateSimulationRequestDto extends createZodDto(CreateSimulationRequestSchema) {}
