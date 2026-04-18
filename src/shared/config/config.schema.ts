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

  // Phase 2+ — Redis + transport selection
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  TRANSPORT_MODE: z.enum(['inmemory', 'bullmq']).default('inmemory'),
  PERSISTENCE_MODE: z.enum(['inmemory', 'redis']).default('inmemory'),
  APP_MODE: z.enum(['orchestrator', 'worker']).default('orchestrator'),
  BULL_BOARD_ENABLED: z.coerce.boolean().default(true),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
