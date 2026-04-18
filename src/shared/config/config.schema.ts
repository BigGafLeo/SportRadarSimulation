import { z } from 'zod';

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Simulation config (Phase 1 defaults per spec §5.6)
  SIMULATION_DURATION_MS: z.coerce.number().int().positive().default(9000),
  GOAL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  GOAL_COUNT: z.coerce.number().int().positive().default(9),
  FIRST_GOAL_OFFSET_MS: z.coerce.number().int().nonnegative().default(1000),
  START_COOLDOWN_MS: z.coerce.number().int().nonnegative().default(5000),
  FINISHED_RETENTION_MS: z.coerce.number().int().positive().default(3_600_000),
  GC_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
