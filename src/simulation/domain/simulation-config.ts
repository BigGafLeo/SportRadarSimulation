/**
 * Timing config for Engine + Dynamics. Mapped from env by config.schema.ts
 * at module wiring time. Lives in domain so Engine/Dynamics can depend
 * on it without reaching into infrastructure.
 */
export interface SimulationConfig {
  readonly durationMs: number;
  readonly goalIntervalMs: number;
  readonly goalCount: number;
  readonly firstGoalOffsetMs: number;
  readonly startCooldownMs: number;
}
