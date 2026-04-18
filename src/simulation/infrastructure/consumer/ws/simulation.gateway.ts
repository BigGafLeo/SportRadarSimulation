import {
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { z } from 'zod';
import type { Server } from 'socket.io';

const SubscribeSchema = z.object({
  simulationId: z.string().uuid(),
});

type SubscribePayload = z.infer<typeof SubscribeSchema>;

export function roomName(simulationId: string): string {
  return `simulation:${simulationId}`;
}

export const ADMIN_ROOM = 'admin:all';

interface GatewaySocket {
  readonly id: string;
  join(room: string): void;
  leave(room: string): void;
}

@WebSocketGateway({ namespace: '/simulations', cors: true })
export class SimulationGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody() payload: unknown,
  ): { ok: true } {
    const parsed: SubscribePayload = SubscribeSchema.parse(payload);
    client.join(roomName(parsed.simulationId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody() payload: unknown,
  ): { ok: true } {
    const parsed: SubscribePayload = SubscribeSchema.parse(payload);
    client.leave(roomName(parsed.simulationId));
    return { ok: true };
  }

  @SubscribeMessage('subscribe-all')
  handleSubscribeAll(@ConnectedSocket() client: GatewaySocket): { ok: true } {
    client.join(ADMIN_ROOM);
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe-all')
  handleUnsubscribeAll(@ConnectedSocket() client: GatewaySocket): { ok: true } {
    client.leave(ADMIN_ROOM);
    return { ok: true };
  }
}
