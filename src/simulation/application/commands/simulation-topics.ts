export const SIMULATION_TOPICS = {
  /** Orchestrator → worker: start (or restart) a simulation run. Topic suffix is profileId. */
  RUN: (profileId: string) => `simulation.run.${profileId}`,
  /** Orchestrator → worker: abort a specific running simulation. */
  ABORT: 'simulation.abort',
} as const;

export const RUN_COMMAND_TYPE = 'RunSimulation' as const;
export const ABORT_COMMAND_TYPE = 'AbortSimulation' as const;
