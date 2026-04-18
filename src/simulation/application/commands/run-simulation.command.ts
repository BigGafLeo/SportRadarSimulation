import type { Command } from '@shared/messaging/command-bus.port';
import { RUN_COMMAND_TYPE } from './simulation-topics';

export interface RunSimulationCommand extends Command {
  readonly type: typeof RUN_COMMAND_TYPE;
  readonly simulationId: string;
  readonly profileId: string;
}

export function runSimulationCommand(
  simulationId: string,
  profileId: string,
): RunSimulationCommand {
  return { type: RUN_COMMAND_TYPE, simulationId, profileId };
}
