export interface Command {
  readonly type: string;
}

export interface Subscription {
  unsubscribe(): Promise<void>;
}

/**
 * Command dispatch port.
 * Default impl (Phase 1): InMemoryCommandBus (Node EventEmitter).
 * Later (Phase 2): BullMQCommandBus (Redis-backed, cross-process).
 */
export interface CommandBus {
  dispatch<C extends Command>(topic: string, command: C): Promise<void>;
  subscribe<C extends Command>(topic: string, handler: (command: C) => Promise<void>): Subscription;
}
