import { Queue, Worker } from 'bullmq';
import type { Command, CommandBus, Subscription } from './command-bus.port';

interface RedisConnectionOptions {
  host: string;
  port: number;
}

function parseRedisUrl(url: string): RedisConnectionOptions {
  const parsed = new URL(url);
  return { host: parsed.hostname, port: Number(parsed.port || 6379) };
}

/**
 * BullMQ-backed CommandBus.
 * - Each topic maps to a separate Queue + Worker (BullMQ Worker consumes jobs).
 * - dispatch() enqueues; subscribe() starts a Worker with the handler.
 * - shutdown() closes all queues + workers.
 */
export class BullMQCommandBus implements CommandBus {
  private readonly connection: RedisConnectionOptions;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Set<Worker>();

  constructor(redisUrl: string) {
    this.connection = parseRedisUrl(redisUrl);
  }

  async dispatch<C extends Command>(topic: string, command: C): Promise<void> {
    const queue = this.getOrCreateQueue(topic);
    await queue.add(command.type, command, {
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  subscribe<C extends Command>(
    topic: string,
    handler: (command: C) => Promise<void>,
  ): Subscription {
    const worker = new Worker(
      topic,
      async (job) => {
        await handler(job.data as C);
      },
      { connection: this.connection, concurrency: 1 },
    );
    this.workers.add(worker);
    return {
      unsubscribe: async () => {
        await worker.close();
        this.workers.delete(worker);
      },
    };
  }

  async shutdown(): Promise<void> {
    await Promise.all(Array.from(this.workers).map((w) => w.close()));
    this.workers.clear();
    await Promise.all(Array.from(this.queues.values()).map((q) => q.close()));
    this.queues.clear();
  }

  getQueues(): ReadonlyMap<string, Queue> {
    return this.queues;
  }

  private getOrCreateQueue(topic: string): Queue {
    let q = this.queues.get(topic);
    if (!q) {
      q = new Queue(topic, { connection: this.connection });
      this.queues.set(topic, q);
    }
    return q;
  }
}
