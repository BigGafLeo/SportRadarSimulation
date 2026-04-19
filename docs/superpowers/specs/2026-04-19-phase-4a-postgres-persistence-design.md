# Phase 4a — Postgres Simulation Persistence Design

**Date:** 2026-04-19
**Branch:** `phase-4-persistence-auth` (4a will tag as `v4.1-postgres-persistence`)
**Phase:** 4a (split from spec §9 Phase 4 per brainstorm decision)
**Spec reference:** `docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md` §9 Phase 4 + §11

---

## 1. Goal

Replace `RedisSimulationRepository` (Phase 2 stepping-stone) with `PostgresSimulationRepository` as the durable persistence layer for `Simulation` aggregates. Domain, application, orchestrator, and worker code stay unchanged — this is a pure adapter swap behind the `SimulationRepository` port. After Phase 4a:

- `docker compose down && docker compose up -d` preserves all simulations and their score state
- Same business tests pass on both `inmemory` (dev/test) and `postgres` (prod/integration) modes
- Phase 4b can layer auth + ownership refactor on top without touching persistence again

`OwnershipRepository` stays InMemory in 4a — it gets replaced entirely (not refactored) in 4b when `OwnershipToken` becomes `UserId`. Persisting it now would mean writing throw-away code.

## 2. Scope split rationale

Phase 4 in spec §9 bundles persistence + auth + ownership refactor + throttle change. Brainstorm decided to split:

- **4a (this doc)** — Persistence only. Adapter swap. Tag `v4.1-postgres-persistence`. ~12-15 tasks.
- **4b (separate spec)** — Auth (register/login/refresh/me) + ownership refactor (`OwnershipToken` → `UserId`) + throttle per-userId. Tag `v4.2-auth-userid`. ~18-20 tasks. Brainstormed separately when 4a is shipped.

Each phase is independently mergeable, demoable, and tagged. Same approach as Phase 1a/1b/1c (P1 split) and Phase 2 (single but discrete units).

## 3. Key decisions

| # | Decision | Rationale |
|---|---|---|
| **D1** | **Full Postgres swap** (no Redis hot/cold hybrid) | At demo scale (10-180 writes/s vs PG's 5000+ TPS), Postgres handles it with ~1% load. Bottleneck order at real scale: worker concurrency (4 → 100+ first), then WS layer, then BullMQ, only THEN Postgres. Hybrid would be premature optimization. Port stays open — Phase 6 can introduce `HybridSimulationRepository` as adapter behind same port if metrics ever demand it. |
| **D2** | **Hybrid schema** (columns for queryable metadata + JSONB for nested `score_snapshot`) | B-tree indexes on `state`, `owner_token` for fast filtering; JSONB for nested score array avoids JOIN-and-rebuild on every `findById`. Phase 5 (rich events) can extend snapshot shape with zero migration. |
| **D3** | **`OwnershipRepository` stays InMemory in 4a** | 4b refactors `OwnershipRepository` → `UserRepository` with different contract. Implementing `PostgresOwnershipRepository` in 4a would be code-to-be-deleted. Demo limitation noted in CHANGELOG: tokens reset on orchestrator restart (run finish/restart in same session). |
| **D4** | **Drop `RedisSimulationRepository`** | Phase 2 stepping stone. After PG, no production use case. `PERSISTENCE_MODE` simplifies from `inmemory\|redis\|postgres` to `inmemory\|postgres`. Tag `v3.0-profile-driven` preserves Redis impl in git history for "look how Hexagonal swap works" demo. |
| **D5** | **Auto-migrate on container startup** via `prisma migrate deploy` in entrypoint | Demo simplicity. Healthcheck + `depends_on.condition: service_healthy` guarantees Postgres ready before migration runs. Production-grade pattern (one ms-scale step at boot). |
| **D6** | **Domain unchanged** — keep `Simulation.toSnapshot()` / `fromSnapshot()` from Phase 2 | Already designed as DB-agnostic serialization. Postgres impl just maps snapshot fields to columns + JSONB. |

## 4. Schema (Prisma model)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Simulation {
  id            String    @id @db.Uuid
  name          String    @db.VarChar(30)
  profileId     String    @map("profile_id") @db.VarChar(50)
  state         String    @db.VarChar(20)        // 'RUNNING' | 'FINISHED'
  totalGoals    Int       @map("total_goals")
  startedAt     DateTime  @map("started_at")    @db.Timestamptz
  finishedAt    DateTime? @map("finished_at")   @db.Timestamptz
  ownerToken    String    @map("owner_token")   @db.Uuid
  scoreSnapshot Json      @map("score_snapshot")  // [{matchId, home, away}, ...]

  @@index([state])
  @@index([ownerToken])
  @@map("simulations")
}
```

**Indexes:**
- `state` — `/simulations` list filters by RUNNING/FINISHED; dashboard polling reads RUNNING-only
- `owner_token` — Phase 4b will rename column to `owner_id` via `ALTER TABLE` + backfill; index transfers cleanly

**JSONB shape (`score_snapshot`):** identical to `MatchScoreSnapshot[]` already in domain (`src/simulation/domain/value-objects/score-board.ts`):
```json
[{"matchId": "germany-poland", "home": 2, "away": 1}, ...]
```

## 5. Repository implementation

`src/simulation/infrastructure/persistence/postgres-simulation.repository.ts`:

```typescript
import type { PrismaClient, Prisma, Simulation as PrismaSimulation } from '@prisma/client';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { Match } from '@simulation/domain/value-objects/match';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';

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
      ownerToken: snap.ownerToken,
      scoreSnapshot: snap.score as Prisma.InputJsonValue,
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

  async findAll(): Promise<Simulation[]> {
    const rows = await this.prisma.simulation.findMany({
      orderBy: { startedAt: 'desc' },
    });
    return rows.map((r) => this.toAggregate(r));
  }

  async delete(id: SimulationId): Promise<void> {
    await this.prisma.simulation.delete({ where: { id: id.value } }).catch(() => {});
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
        ownerToken: row.ownerToken,
        score: row.scoreSnapshot as Array<{ matchId: string; home: number; away: number }>,
      },
      this.matches,
    );
  }
}
```

`Simulation.fromSnapshot()` already exists from Phase 2 (designed for cross-repo reconstruction).

## 6. Module wiring

`PERSISTENCE_MODE` enum changes from `['inmemory', 'redis']` to `['inmemory', 'postgres']`. Both `simulation.module.ts` and `worker.module.ts` get the same factory shape:

```ts
{
  provide: PORT_TOKENS.SIMULATION_REPOSITORY,
  useFactory: async (config: ConfigService<AppConfig, true>) => {
    const mode = config.get('PERSISTENCE_MODE', { infer: true });
    if (mode === 'postgres') {
      const { getPrismaClient } = await import('../shared/infrastructure/prisma.client');
      const { PostgresSimulationRepository } = await import(
        './infrastructure/persistence/postgres-simulation.repository'
      );
      const { PRESET_MATCHES } = await import('./domain/value-objects/matches-preset');
      const prisma = getPrismaClient(config.get('DATABASE_URL', { infer: true }));
      return new PostgresSimulationRepository(prisma, PRESET_MATCHES);
    }
    return new InMemorySimulationRepository();
  },
  inject: [ConfigService],
}
```

`getPrismaClient(url)` is a lazy singleton in `src/shared/infrastructure/prisma.client.ts` — orchestrator and worker both reuse the same connection pool config (Prisma defaults: 10 connections per process × pool, fine for our scale).

## 7. Migration strategy

**Auto-migrate on container startup.** Dockerfile runtime stage entry:
```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && (if [ \"$APP_MODE\" = worker ]; then node dist/worker.main.js; else node dist/main.js; fi)"]
```

**Compose ordering:**
```yaml
postgres:
  image: postgres:16-alpine
  environment:
    POSTGRES_DB: sportradar
    POSTGRES_USER: sportradar
    POSTGRES_PASSWORD: sportradar
  volumes:
    - postgres-data:/var/lib/postgresql/data
  healthcheck:
    test: ['CMD-SHELL', 'pg_isready -U sportradar']
    interval: 5s
    timeout: 3s
    retries: 5

orchestrator:
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  environment:
    DATABASE_URL: postgresql://sportradar:sportradar@postgres:5432/sportradar
    PERSISTENCE_MODE: postgres
    # ... existing
```

Workers get same `DATABASE_URL` + `PERSISTENCE_MODE: postgres` + `depends_on.postgres.condition: service_healthy`.

**Dev workflow:**
- `npx prisma migrate dev --name <slug>` to generate migration during development
- Migrations committed to `prisma/migrations/` (Prisma standard)
- `prisma migrate deploy` (in compose) only applies — never generates

**Initial migration:** single `20260419xxxxxx_phase4a_simulation_table` containing `CREATE TABLE simulations` + indexes.

## 8. Docker compose changes

```yaml
services:
  postgres:                          # NEW
    image: postgres:16-alpine
    container_name: sportradar-postgres
    environment:
      POSTGRES_DB: sportradar
      POSTGRES_USER: sportradar
      POSTGRES_PASSWORD: sportradar
    ports:
      - '5432:5432'                  # exposed for external clients (psql, dbeaver) during demo
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U sportradar -d sportradar']
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    # unchanged — still needed for BullMQ queues

  orchestrator:
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    environment:
      DATABASE_URL: postgresql://sportradar:sportradar@postgres:5432/sportradar
      PERSISTENCE_MODE: postgres
      # ... existing

  worker-uniform / worker-poisson / worker-markov:
    # same depends_on + DATABASE_URL + PERSISTENCE_MODE additions

volumes:
  postgres-data:                     # NEW named volume for durability across compose down
```

**Why named volume:** `docker compose down` (without `-v`) keeps data; `docker compose down -v` wipes it. Demo: "patrz, sims przeżywają restart" wymaga volume.

## 9. Testing strategy

- **Unit tests** (existing, ~207): unchanged. InMemory repo + FakeClock.
- **Integration distributed** (new): `test/integration/distributed/postgres-simulation.repository.spec.ts`
  - Testcontainers `postgres:16-alpine` per suite (`beforeAll` start, `afterAll` stop)
  - Run migrations programmatically: `execSync('npx prisma migrate deploy')` with `DATABASE_URL` pointing at container
  - Tests cover: `save` upsert (insert + update paths), `findById` (hit + miss), `findAll` (ordering by startedAt desc), `delete`, JSONB roundtrip preserves score shape, indexes used (`EXPLAIN`)
  - ~5-8 tests
- **Existing distributed test removed**: `test/integration/distributed/redis-simulation.repository.spec.ts` deleted with the impl
- **Phase 4a delivery target**: ~210+ total tests (185 carried + ~5-8 new PG, ~14 lost from Redis-PG removal)

## 10. File structure

```
prisma/                                              [NEW]
├── schema.prisma
└── migrations/
    └── 20260419xxxxxx_phase4a_simulation_table/
        └── migration.sql

src/
├── shared/
│   ├── config/
│   │   └── config.schema.ts                        [MOD: PERSISTENCE_MODE values, + DATABASE_URL]
│   └── infrastructure/
│       ├── prisma.client.ts                        [NEW: lazy singleton]
│       └── redis.client.ts                         [unchanged]
└── simulation/
    ├── infrastructure/persistence/
    │   ├── in-memory-simulation.repository.ts      [unchanged]
    │   ├── redis-simulation.repository.ts          [DELETED]
    │   └── postgres-simulation.repository.ts       [NEW]
    ├── simulation.module.ts                        [MOD: factory branches inmemory|postgres]
    └── ...

src/worker/worker.module.ts                          [MOD: same factory change as simulation.module]

docker-compose.yml                                   [MOD: + postgres service, env, depends_on, volume]
Dockerfile                                           [MOD: + COPY prisma, + prisma generate in build, + migrate deploy in CMD]

package.json                                         [MOD: + @prisma/client, + prisma (devDep), + @testcontainers/postgresql (devDep)]

test/integration/distributed/
├── postgres-simulation.repository.spec.ts          [NEW]
└── redis-simulation.repository.spec.ts             [DELETED]

docs/decisions/
├── 006-postgres-swap.md                            [NEW: D1 rationale]
├── 007-schema-hybrid-columns-jsonb.md              [NEW: D2 rationale]
└── 008-drop-redis-simulation-repository.md         [NEW: D4 rationale]

CHANGELOG.md                                         [MOD: [4.1.0] entry with Notes about ownership-still-inmemory]
README.md                                            [MOD: Phase 4a status, postgres in usage, env table updated]
```

## 11. ADRs

- **ADR-006**: Postgres swap full vs hybrid — D1 rationale
- **ADR-007**: Schema hybrid (columns + JSONB) vs full normalization vs full JSONB — D2 rationale
- **ADR-008**: Drop `RedisSimulationRepository` — D4 rationale

ADR template per CLAUDE.md (Status / Date / Phase / Context / Options / Decision / Consequences / References).

## 12. Phase 4a delivery state (expected)

- `v4.1-postgres-persistence` git tag
- ~210+ tests passing (unit unchanged, +5-8 PG integration, -14 Redis integration)
- `docker compose up -d` starts: `postgres` (NEW) + `redis` + `orchestrator` + `worker-uniform×2` + `worker-poisson×1` + `worker-markov×1` = **7 service slots**
- `docker compose down && docker compose up -d` → all simulations preserved
- `docker compose down -v && docker compose up -d` → fresh DB, schema auto-migrated on first boot
- `psql -h localhost -U sportradar -d sportradar -c "SELECT id, name, state, total_goals FROM simulations;"` — direct DB inspection works
- Dashboard (still on `feature/dashboard-realtime` — not touched) keeps working: `/admin/stats` reads from PG via repo
- 3 ADRs (006-008) in `docs/decisions/`
- CHANGELOG `[4.1.0]` entry
- README updated: phase status, env table, "tokens reset on restart" caveat
- Post-impl: `simplify` skill + `feature-dev:code-reviewer` security focus

## 13. Out of scope (explicitly)

- Auth (register/login/refresh/me) — Phase 4b
- `OwnershipRepository` → `UserRepository` refactor — Phase 4b
- Throttle per-userId — Phase 4b
- Read replicas, sharding — Phase 6 (only if metrics demand)
- `HybridSimulationRepository` (Redis hot + PG cold) — Phase 6 (only if metrics demand)
- `SimulationEvent` table for replay — Phase 5 (rich domain operations)
- Connection pool tuning beyond Prisma defaults — Phase 6
- Backup/restore tooling — Phase 6 ops maturity

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Migration fails on first boot (transient PG not ready despite healthcheck) | `migrate deploy` is idempotent + retried via Docker `restart: unless-stopped`. Worst case: 2 restarts, then OK. |
| Connection pool exhaustion under load | Default 10/process × 5 processes = 50 connections; PG default `max_connections = 100`. ~50% headroom. Monitor in Phase 6 metrics. |
| Schema drift (dev migrations not committed) | CI gate: `prisma migrate diff` in lint job. Phase 6 (CI maturity). For 4a: discipline + commit hook locally. |
| Tokens reset on orchestrator restart (in-memory ownership) | Documented limitation in CHANGELOG. Resolved by Phase 4b user accounts. |
| BullMQ queues exist before postgres ready (race) | `depends_on` chain ensures orchestrator/workers wait for both. BullMQ-vs-PG dependency is independent. |

---

## 15. Open question (none)

All Q1-Q5 from brainstorming session resolved. Design ready for plan generation.
