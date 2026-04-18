/**
 * DI injection tokens for simulation ports.
 * Phase 0: tokens defined; Phase 1: interfaces filled + providers wired.
 */
export const PORT_TOKENS = {
  SIMULATION_REPOSITORY: Symbol('SimulationRepository'),
  CLOCK: Symbol('Clock'),
  RANDOM_PROVIDER: Symbol('RandomProvider'),
  EVENT_PUBLISHER: Symbol('EventPublisher'),
  SIMULATION_ENGINE: Symbol('SimulationEngine'),
  MATCH_DYNAMICS: Symbol('MatchDynamics'),
  RETENTION_POLICY: Symbol('RetentionPolicy'),
  THROTTLE_POLICY: Symbol('ThrottlePolicy'),
  OWNERSHIP_TOKEN_GENERATOR: Symbol('OwnershipTokenGenerator'),
  OWNERSHIP_REPOSITORY: Symbol('OwnershipRepository'),
  COMMAND_BUS: Symbol('CommandBus'),
  EVENT_BUS: Symbol('EventBus'),
} as const;
