import { Redis } from 'ioredis';

/**
 * Factory for shared Redis client. Lazy connection — connection only attempted
 * on first command. Used by BullMQ Queue/Worker instances and RedisSimulationRepository.
 */
export function createRedisClient(url: string): Redis {
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: null, // required by BullMQ
  });
}

export type RedisClient = Redis;
