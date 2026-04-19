import { PrismaClient } from '@prisma/client';

/**
 * Lazy PrismaClient singleton. Both orchestrator and worker processes
 * share one client per process (Prisma manages its own connection pool —
 * default 10 connections).
 *
 * The factory keys by datasource URL so tests using ephemeral
 * Testcontainer URLs don't collide with the production singleton.
 */
const clients = new Map<string, PrismaClient>();

export function getPrismaClient(databaseUrl: string): PrismaClient {
  const existing = clients.get(databaseUrl);
  if (existing) return existing;
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  clients.set(databaseUrl, client);
  return client;
}

/**
 * Disconnects all cached PrismaClient instances. Used in module teardown
 * and test cleanup. Safe to call multiple times.
 */
export async function disconnectPrismaClient(): Promise<void> {
  const all = Array.from(clients.values());
  clients.clear();
  await Promise.all(all.map((c) => c.$disconnect()));
}
