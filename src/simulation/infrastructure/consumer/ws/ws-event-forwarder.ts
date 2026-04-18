import type { EventBus } from '@shared/messaging/event-bus.port';
import type { Subscription } from '@shared/messaging/command-bus.port';
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import { ADMIN_ROOM, roomName } from './simulation.gateway';

interface BroadcastServer {
  to(room: string): { emit(event: string, payload: unknown): void };
}

const EVENT_NAME_BY_TYPE: Record<string, string> = {
  SimulationStarted: 'simulation-started',
  GoalScored: 'goal-scored',
  SimulationFinished: 'simulation-finished',
  SimulationRestarted: 'simulation-restarted',
};

function eventPayload(event: DomainEvent): Record<string, unknown> {
  return JSON.parse(JSON.stringify(event));
}

export class WsEventForwarder {
  private subscription: Subscription | null = null;

  constructor(
    private readonly eventBus: EventBus,
    private readonly getServer: () => BroadcastServer,
  ) {}

  start(): void {
    this.subscription = this.eventBus.subscribe(
      () => true,
      async (event, meta) => {
        if (!meta.simulationId) return;
        const wsEventName = EVENT_NAME_BY_TYPE[event.type];
        if (!wsEventName) return;
        const payload = eventPayload(event);
        const server = this.getServer();
        server.to(roomName(meta.simulationId)).emit(wsEventName, payload);
        server.to(ADMIN_ROOM).emit(wsEventName, payload);
      },
    );
  }

  async stop(): Promise<void> {
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
    }
  }
}
