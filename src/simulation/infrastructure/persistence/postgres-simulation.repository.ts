import type { PrismaClient, Prisma, Simulation as PrismaSimulation } from '@prisma/client';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { Match } from '@simulation/domain/value-objects/match';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import type { SimulationId } from '@simulation/domain/value-objects/simulation-id';

// ADR-006 (full swap to Postgres), ADR-007 (hybrid schema: queryable columns + JSONB score_snapshot)
export class PostgresSimulationRepository implements SimulationRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly matches: readonly Match[],
  ) {}

  async save(sim: Simulation): Promise<void> {
    const snap = sim.toSnapshot();
    const data = {
      id: snap.id,
      name: snap.name,
      profileId: snap.profileId,
      state: snap.state,
      totalGoals: snap.totalGoals,
      startedAt: snap.startedAt,
      finishedAt: snap.finishedAt,
      ownerId: snap.ownerId,
      scoreSnapshot: snap.score as unknown as Prisma.InputJsonValue,
    };
    await this.prisma.simulation.upsert({
      where: { id: snap.id },
      create: data,
      update: data,
    });
  }

  async findById(id: SimulationId): Promise<Simulation | null> {
    const row = await this.prisma.simulation.findUnique({ where: { id: id.value } });
    if (!row) return null;
    return this.toAggregate(row);
  }

  async findAll(): Promise<readonly Simulation[]> {
    const rows = await this.prisma.simulation.findMany({ orderBy: { startedAt: 'desc' } });
    return rows.map((r) => this.toAggregate(r));
  }

  async findByOwner(ownerId: string): Promise<readonly Simulation[]> {
    const rows = await this.prisma.simulation.findMany({
      where: { ownerId },
      orderBy: { startedAt: 'desc' },
    });
    return rows.map((r) => this.toAggregate(r));
  }

  async findLastStartedAtByOwner(ownerId: string): Promise<Date | null> {
    const row = await this.prisma.simulation.findFirst({
      where: { ownerId },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    });
    return row?.startedAt ?? null;
  }

  async delete(id: SimulationId): Promise<void> {
    try {
      await this.prisma.simulation.delete({ where: { id: id.value } });
    } catch (err: unknown) {
      if (err != null && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
        return;
      }
      throw err;
    }
  }

  private toAggregate(row: PrismaSimulation): Simulation {
    return Simulation.fromSnapshot(
      {
        id: row.id,
        name: row.name,
        profileId: row.profileId,
        state: row.state as 'RUNNING' | 'FINISHED',
        totalGoals: row.totalGoals,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        ownerId: row.ownerId,
        score: row.scoreSnapshot as unknown as Array<{
          matchId: string;
          home: number;
          away: number;
        }>,
      },
      this.matches,
    );
  }
}
