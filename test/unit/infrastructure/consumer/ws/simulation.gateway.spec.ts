import { SimulationGateway } from '@simulation/infrastructure/consumer/ws/simulation.gateway';
import { WsEventForwarder } from '@simulation/infrastructure/consumer/ws/ws-event-forwarder';
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import { InMemoryEventPublisher } from '@shared/messaging/in-memory-event-publisher';
import { GoalScored } from '@simulation/domain/events/goal-scored';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { TeamId } from '@simulation/domain/value-objects/team-id';

interface MockSocket {
  readonly id: string;
  readonly rooms: Set<string>;
  join(room: string): void;
  leave(room: string): void;
  emit(event: string, payload: unknown): void;
  _emitted: Array<{ event: string; payload: unknown }>;
}

function makeSocket(id: string): MockSocket {
  return {
    id,
    rooms: new Set(),
    _emitted: [],
    join(room) {
      this.rooms.add(room);
    },
    leave(room) {
      this.rooms.delete(room);
    },
    emit(event, payload) {
      this._emitted.push({ event, payload });
    },
  };
}

interface MockServer {
  readonly rooms: Map<string, Set<MockSocket>>;
  to(room: string): { emit(event: string, payload: unknown): void };
}

function makeServer(): MockServer {
  const rooms = new Map<string, Set<MockSocket>>();
  return {
    rooms,
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          for (const socket of rooms.get(room) ?? []) {
            socket.emit(event, payload);
          }
        },
      };
    },
  };
}

describe('SimulationGateway', () => {
  it('handleSubscribe joins the client to simulation:{id} room', () => {
    const gateway = new SimulationGateway();
    const socket = makeSocket('client-1');
    gateway.handleSubscribe(socket as never, {
      simulationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(socket.rooms.has('simulation:550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('handleSubscribe rejects bad simulationId format (not UUID)', () => {
    const gateway = new SimulationGateway();
    const socket = makeSocket('client-1');
    expect(() => gateway.handleSubscribe(socket as never, { simulationId: 'invalid' })).toThrow();
    expect(socket.rooms.size).toBe(0);
  });

  it('handleUnsubscribe leaves the room', () => {
    const gateway = new SimulationGateway();
    const socket = makeSocket('client-1');
    gateway.handleSubscribe(socket as never, {
      simulationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    gateway.handleUnsubscribe(socket as never, {
      simulationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(socket.rooms.size).toBe(0);
  });
});

describe('WsEventForwarder', () => {
  it('broadcasts GoalScored to correct simulation room', async () => {
    const bus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(bus);
    const server = makeServer();
    const forwarder = new WsEventForwarder(bus, () => server as never);
    forwarder.start();

    const simId = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
    const socket = makeSocket('client-1');
    server.rooms.set('simulation:' + simId.value, new Set([socket]));

    await publisher.publish(
      new GoalScored(
        simId,
        TeamId.create('germany'),
        [{ matchId: 'm1', home: 1, away: 0 }],
        1,
        new Date('2026-04-18T12:00:01Z'),
      ),
    );

    expect(socket._emitted).toHaveLength(1);
    expect(socket._emitted[0].event).toBe('goal-scored');
    expect(socket._emitted[0].payload).toMatchObject({
      simulationId: simId.value,
      teamId: 'germany',
      totalGoals: 1,
    });

    await forwarder.stop();
  });

  it('does not broadcast to clients in other rooms', async () => {
    const bus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(bus);
    const server = makeServer();
    const forwarder = new WsEventForwarder(bus, () => server as never);
    forwarder.start();

    const simId1 = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
    const simId2 = SimulationId.create('550e8400-e29b-41d4-a716-446655440001');
    const s1 = makeSocket('c1');
    const s2 = makeSocket('c2');
    server.rooms.set('simulation:' + simId1.value, new Set([s1]));
    server.rooms.set('simulation:' + simId2.value, new Set([s2]));

    await publisher.publish(new GoalScored(simId1, TeamId.create('germany'), [], 1, new Date()));
    expect(s1._emitted).toHaveLength(1);
    expect(s2._emitted).toHaveLength(0);

    await forwarder.stop();
  });
});
