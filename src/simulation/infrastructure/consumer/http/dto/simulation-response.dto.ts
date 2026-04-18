import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const MatchScoreSchema = z.object({
  matchId: z.string(),
  home: z.number().int().nonnegative(),
  away: z.number().int().nonnegative(),
});

export const SimulationResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  state: z.enum(['RUNNING', 'FINISHED']),
  score: z.array(MatchScoreSchema),
  totalGoals: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  profileId: z.string(),
});

export class SimulationResponseDto extends createZodDto(SimulationResponseSchema) {}
