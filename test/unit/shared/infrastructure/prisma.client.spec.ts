import { getPrismaClient, disconnectPrismaClient } from '@shared/infrastructure/prisma.client';

describe('getPrismaClient', () => {
  afterEach(async () => {
    await disconnectPrismaClient();
  });

  it('returns same instance for same DATABASE_URL (singleton)', () => {
    const url = 'postgresql://test:test@localhost:5432/test';
    const a = getPrismaClient(url);
    const b = getPrismaClient(url);
    expect(a).toBe(b);
  });

  it('returns a PrismaClient instance with $disconnect method', () => {
    const url = 'postgresql://test:test@localhost:5432/test';
    const client = getPrismaClient(url);
    expect(typeof client.$disconnect).toBe('function');
  });

  it('different URLs return different instances (verify isolation)', () => {
    const urlA = 'postgresql://test:test@localhost:5432/db_a';
    const urlB = 'postgresql://test:test@localhost:5432/db_b';
    const clientA = getPrismaClient(urlA);
    const clientB = getPrismaClient(urlB);
    expect(clientA).not.toBe(clientB);
  });
});
