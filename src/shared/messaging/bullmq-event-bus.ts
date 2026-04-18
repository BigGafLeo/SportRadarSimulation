import { Queue, Worker } from 'bullmq';
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import type { EventBus, EventFilter, EventMeta } from './event-bus.port';
import type { Subscription } from './command-bus.port';

const EVENTS_QUEUE = 'simulation.events';

function parseRedisUrl(url: string): { host: string; port: number } {
  const parsed = new URL(url);
  return { host: parsed.hostname, port: Number(parsed.port || 6379) };
}

interface EventJobData {
  readonly event: DomainEvent;
  readonly meta: EventMeta;
}

/**
 * BullMQ-backed EventBus.
 * - Single queue 'simulation.events'; publish → queue.add
 * - subscribe() starts Worker that applies filter+handler
 * - Semantic note: queue semantics = 1 message → 1 worker. For Phase 2 single-orchestrator
 *   this is fine. Phase 3+ multi-orchestrator would require Redis pub/sub instead.
 */
export class BullMQEventBus implements EventBus {
  private readonly connection: { host: string; port: number };
  private readonly queue: Queue;
  private readonly workers: Worker[] = [];

  constructor(redisUrl: string) {
    this.connection = parseRedisUrl(redisUrl);
    this.queue = new Queue(EVENTS_QUEUE, { connection: this.connection });
  }

  async publish(event: DomainEvent, meta: EventMeta = {}): Promise<void> {
    const data: EventJobData = { event, meta };
    await this.queue.add(event.type, data, {
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  subscribe(
    filter: EventFilter,
    handler: (event: DomainEvent, meta: EventMeta) => Promise<void>,
  ): Subscription {
    const worker = new Worker(
      EVENTS_QUEUE,
      async (job) => {
        const data = job.data as EventJobData;
        if (filter(data.event, data.meta)) {
          await handler(data.event, data.meta);
        }
      },
      { connection: this.connection, concurrency: 1 },
    );
    this.workers.push(worker);
    return {
      unsubscribe: async () => {
        await worker.close();
        const idx = this.workers.indexOf(worker);
        if (idx >= 0) this.workers.splice(idx, 1);
      },
    };
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    this.workers.length = 0;
    await this.queue.close();
  }

  getQueue(): Queue {
    return this.queue;
  }
}
