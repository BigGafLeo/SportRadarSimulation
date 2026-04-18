import type { Command } from '@shared/messaging/command-bus.port';
import { ABORT_COMMAND_TYPE } from './simulation-topics';

export interface AbortSimulationCommand extends Command {
  readonly type: typeof ABORT_COMMAND_TYPE;
  readonly simulationId: string;
  readonly finishedAtMs: number;
}

export function abortSimulationCommand(
  simulationId: string,
  finishedAtMs: number,
): AbortSimulationCommand {
  return { type: ABORT_COMMAND_TYPE, simulationId, finishedAtMs };
}
