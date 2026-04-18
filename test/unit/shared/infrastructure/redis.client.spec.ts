import { createRedisClient } from '@shared/infrastructure/redis.client';

describe('createRedisClient', () => {
  it('creates an ioredis instance with provided URL', () => {
    const client = createRedisClient('redis://localhost:6379');
    expect(client).toBeDefined();
    expect(typeof client.ping).toBe('function');
    client.disconnect();
  });

  it('lazyConnect option defers connection (no error on creation with invalid host)', () => {
    const client = createRedisClient('redis://invalid-host:9999');
    expect(client).toBeDefined();
    client.disconnect();
  });
});
