import { z } from 'zod';

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Simulation policy config (per-dynamics timing now lives in profile registry).
  START_COOLDOWN_MS: z.coerce.number().int().nonnegative().default(5000),
  FINISHED_RETENTION_MS: z.coerce.number().int().positive().default(3_600_000),
  GC_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),

  // Phase 2+ — Redis + transport selection
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://sportradar:sportradar@localhost:5432/sportradar'),
  TRANSPORT_MODE: z.enum(['inmemory', 'bullmq']).default('inmemory'),
  PERSISTENCE_MODE: z.enum(['inmemory', 'postgres']).default('inmemory'),
  APP_MODE: z.enum(['orchestrator', 'worker']).default('orchestrator'),
  BULL_BOARD_ENABLED: z.coerce.boolean().default(true),

  // Phase 3+ — profile-driven workers (hardcoded enum: config must not depend on infra)
  SIMULATION_PROFILE: z
    .enum(['uniform-realtime', 'poisson-accelerated', 'fast-markov'])
    .default('uniform-realtime'),

  // Phase 4+ — auth
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(900),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
