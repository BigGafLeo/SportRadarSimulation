import type { Command, CommandBus, Subscription } from './command-bus.port';

type Handler = (command: Command) => Promise<void>;

export class InMemoryCommandBus implements CommandBus {
  private readonly handlers = new Map<string, Set<Handler>>();

  async dispatch<C extends Command>(topic: string, command: C): Promise<void> {
    const set = this.handlers.get(topic);
    if (!set) return;
    for (const handler of Array.from(set)) {
      await handler(command);
    }
  }

  subscribe<C extends Command>(
    topic: string,
    handler: (command: C) => Promise<void>,
  ): Subscription {
    let set = this.handlers.get(topic);
    if (!set) {
      set = new Set();
      this.handlers.set(topic, set);
    }
    const wrapped: Handler = handler as Handler;
    set.add(wrapped);
    return {
      unsubscribe: async () => {
        set!.delete(wrapped);
        if (set!.size === 0) this.handlers.delete(topic);
      },
    };
  }
}
