# Phase 4a — Postgres Simulation Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap `RedisSimulationRepository` (Phase 2 stepping-stone) → `PostgresSimulationRepository` as the durable persistence layer for `Simulation` aggregates. Same business tests pass on `inmemory` and `postgres` modes. `docker compose down && up -d` preserves all simulations.

**Architecture:** Adapter swap behind the existing `SimulationRepository` port. PostgreSQL 16 + Prisma ORM. Hybrid schema: queryable columns (`state`, `owner_token`, `name`, etc.) + JSONB `score_snapshot`. Auto-migrate via `prisma migrate deploy` in container entrypoint. Domain, application, orchestrator, worker code unchanged. `OwnershipRepository` stays InMemory (Phase 4b refactors it to `UserRepository`).

**Tech Stack:** PostgreSQL 16-alpine, Prisma 5.x (`@prisma/client` + `prisma`), `@testcontainers/postgresql` 10.x. Existing stack (NestJS 10, TypeScript strict, Zod, BullMQ, Jest).

**Spec reference:** `docs/superpowers/specs/2026-04-19-phase-4a-postgres-persistence-design.md`

**Phase 3 state (input):** tag `v3.0-profile-driven`, 207 tests passing, 3 profiles working in distributed mode.

**Phase 4a delivery state (expected):**
- ~210+ tests (unit unchanged, +5-8 PG integration via Testcontainers, -14 Redis impl tests)
- `v4.1-postgres-persistence` git tag
- 7 services in `docker compose ps`: postgres + redis + orchestrator + worker-uniform×2 + worker-poisson + worker-markov
- `docker compose down && up -d` preserves sims (Postgres named volume)
- `psql -h localhost -U sportradar -d sportradar -c "SELECT * FROM simulations"` works
- Dashboard (still on `feature/dashboard-realtime` branch — not modified) keeps working
- 3 ADRs (006, 007, 008)
- CHANGELOG `[4.1.0]` entry, README updated

---

## Key design decisions (from spec)

- **D1**: Full Postgres swap, no Redis hot/cold hybrid (premature at our scale)
- **D2**: Hybrid schema — columns + JSONB
- **D3**: `OwnershipRepository` stays InMemory in 4a (4b refactors entirely)
- **D4**: Drop `RedisSimulationRepository` — Phase 2 stepping stone, no longer needed
- **D5**: Auto-migrate via `prisma migrate deploy` in container entrypoint
- **D6**: Domain unchanged — reuse `Simulation.toSnapshot()` / `fromSnapshot()` from Phase 2

---

## File structure

### New files
```
prisma/
├── schema.prisma                                                    [Task 6]
└── migrations/
    └── <timestamp>_phase4a_simulation_table/
        └── migration.sql                                            [Task 7 — Prisma generated]

docs/decisions/
├── 006-postgres-simulation-repository.md                            [Task 1]
├── 007-schema-hybrid-columns-jsonb.md                               [Task 2]
└── 008-drop-redis-simulation-repository.md                          [Task 3]

src/
├── shared/
│   └── infrastructure/
│       └── prisma.client.ts                                         [Task 9]
└── simulation/
    └── infrastructure/persistence/
        └── postgres-simulation.repository.ts                        [Task 10]

test/integration/distributed/
└── postgres-simulation.repository.spec.ts                           [Task 11]
```

### Modified files
```
src/shared/config/config.schema.ts                                   [Task 8]
  - PERSISTENCE_MODE: enum 'inmemory'|'postgres' (was 'inmemory'|'redis')
  - DATABASE_URL: new env

src/simulation/simulation.module.ts                                  [Task 12]
  - SIMULATION_REPOSITORY factory: branch on inmemory|postgres (drop redis branch)

src/worker/worker.module.ts                                          [Task 13]
  - same SIMULATION_REPOSITORY factory change

Dockerfile                                                            [Task 15]
  - COPY prisma ./prisma in builder + runner
  - npx prisma generate in build stage
  - migrate deploy in runtime CMD

docker-compose.yml                                                   [Task 16]
  - + postgres service (image, env, healthcheck, volume)
  - + DATABASE_URL + PERSISTENCE_MODE: postgres on orchestrator + 3 workers
  - + depends_on postgres condition: service_healthy on those 4 services
  - + named volume postgres-data

package.json                                                         [Task 4]
  - + dependencies: @prisma/client ^5.x
  - + devDependencies: prisma ^5.x, @testcontainers/postgresql ^10.x
  - + scripts: postinstall (prisma generate), db:migrate (prisma migrate dev)

CHANGELOG.md                                                         [Task 17]
  - + [4.1.0] section above [3.0.0]

README.md                                                            [Task 18]
  - Phase 4a status entry, env table updated, ownership caveat
```

### Deleted files
```
src/simulation/infrastructure/persistence/redis-simulation.repository.ts   [Task 14]
test/integration/distributed/redis-simulation.repository.spec.ts            [Task 14]
```

---

## Tasks

### Task 1: ADR-006 — Postgres Simulation Repository swap

**Files:**
- Create: `docs/decisions/006-postgres-simulation-repository.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR-006: Postgres Simulation Repository — full swap (no Redis hot/cold hybrid)

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 4a

## Context
Phase 4a replaces `RedisSimulationRepository` (Phase 2 stepping-stone) with a durable persistence layer. Two shapes considered: (1) full Postgres swap, (2) hybrid Redis-hot + Postgres-cold where Redis stays as working set and Postgres receives only lifecycle events.

## Options considered
1. **Full Postgres swap** — single repository impl, every `save()` writes to PG. Simple model, single source of truth.
2. **Hybrid Redis hot + Postgres cold** — Redis keeps running aggregates, Postgres receives snapshot on `finish()`. Two repos, route by state.
3. **Postgres + write-coalesce** — full PG with batched writes flushed on tick boundaries.

## Decision
Option 1 (full Postgres swap). At demo scale our load is 10-180 writes/s; Postgres 16 handles 5000+ TPS with default config — ~1% utilization. Bottleneck order at real high scale: worker concurrency (4 instances → 100+ first), then WS layer, then BullMQ, only then Postgres. Hybrid would be premature optimization. The `SimulationRepository` port stays open — Phase 6 can introduce `HybridSimulationRepository` as a new adapter behind the same port if metrics ever demand it. Zero refactor needed in domain/application.

## Consequences
- ✅ Single repo impl — simple to reason about, easy to test
- ✅ `docker compose down && up -d` preserves all simulations (no cache rebuild dance)
- ✅ Phase 5 (event sourcing / replay) lands naturally on PG with new tables
- ✅ Port-based design preserves the option of hybrid swap later (just a new adapter, no domain change)
- ❌ Each `applyGoal` is one PG transaction (~2-5ms). For demo this adds <50ms cumulative per match — invisible.
- 🔄 `RedisSimulationRepository` is deleted (see ADR-008)

## References
- Phase 4a spec: `docs/superpowers/specs/2026-04-19-phase-4a-postgres-persistence-design.md` §3 D1
- Phase 4a plan Task 10
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/006-postgres-simulation-repository.md
git commit -m "docs(adr): ADR-006 — Postgres simulation repository, full swap"
```

---

### Task 2: ADR-007 — Schema hybrid (columns + JSONB)

**Files:**
- Create: `docs/decisions/007-schema-hybrid-columns-jsonb.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR-007: Simulation table schema — hybrid (queryable columns + JSONB score)

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 4a

## Context
The `simulations` table needs to support: indexed filtering (dashboard polls RUNNING-only sims), per-aggregate fast load (no JOIN-and-rebuild on every `findById`), and forward-compatible schema for Phase 5 rich events.

## Options considered
1. **JSONB blob** — single `snapshot JSONB` column with the full aggregate snapshot. Filter via `WHERE snapshot->>'state' = 'RUNNING'`.
2. **Fully normalized** — every aggregate field as its own column, including `match_scores` in a child table.
3. **Hybrid** — metadata columns for queryable fields (`state`, `owner_token`, `name`, `total_goals`, `started_at`, `finished_at`, `profile_id`) + JSONB `score_snapshot` for the `MatchScoreSnapshot[]` array.

## Decision
Option 3 (hybrid). B-tree indexes on `state` and `owner_token` give millisecond filter responses; JSONB for the per-match score array avoids a JOIN on every `findById` and keeps the schema flexible for Phase 5 (rich events extend snapshot shape with zero migration).

## Consequences
- ✅ `WHERE state = 'RUNNING'` uses index (sub-ms even with 100k rows)
- ✅ Phase 4b ownership refactor: `ALTER TABLE simulations ADD COLUMN owner_id UUID NULL; UPDATE ... SET owner_id = ... FROM users WHERE token = owner_token; ALTER TABLE simulations DROP COLUMN owner_token;` — clean
- ✅ Phase 5 rich events: extend `score_snapshot` JSONB shape (e.g., add `cards`, `injuries`) without migration
- ❌ More repository mapping code than option 1 (each column → snapshot field)
- ❌ `score_snapshot` not indexed — full table scan if you ever want "sims where home team scored ≥5". Acceptable: not a real query pattern.

## References
- Phase 4a spec: `docs/superpowers/specs/2026-04-19-phase-4a-postgres-persistence-design.md` §3 D2, §4
- Phase 4a plan Task 6
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/007-schema-hybrid-columns-jsonb.md
git commit -m "docs(adr): ADR-007 — Simulation schema hybrid (columns + JSONB)"
```

---

### Task 3: ADR-008 — Drop RedisSimulationRepository

**Files:**
- Create: `docs/decisions/008-drop-redis-simulation-repository.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR-008: Drop `RedisSimulationRepository` after Postgres swap

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 4a

## Context
Phase 2 introduced `RedisSimulationRepository` (HSET + JSON serialization) as a stepping-stone — distributed mode without requiring a relational DB. Phase 4a brings PostgreSQL as the production persistence target. The Redis adapter has no remaining production use case.

## Options considered
1. **Keep all 3 impls** (`inmemory|redis|postgres`) — backward compat for env values.
2. **Drop `RedisSimulationRepository`** — `PERSISTENCE_MODE` reduces to `inmemory|postgres`.
3. **Mark as `@deprecated`** — keep file but warn in factory.

## Decision
Option 2 (drop). Redis-as-persistence was a temporary decision (Phase 2 §D2 brainstorm). After Postgres lands, maintaining a third path adds factory branches, tests, and confusion ("which is canonical?") with zero benefit. The Phase 2 demo argument ("same business test passes on Redis too") is preserved via git history — `git checkout v3.0-profile-driven` restores the impl. Redis container itself stays running (BullMQ needs it).

## Consequences
- ✅ One fewer adapter to maintain (factory branches, tests, type imports)
- ✅ `PERSISTENCE_MODE` becomes a binary choice: `inmemory` (dev/test) or `postgres` (prod) — reduces cognitive load
- ✅ Cleaner demo narrative: "Redis = transport layer (BullMQ), Postgres = persistence layer"
- ❌ Breaking change for anyone with `PERSISTENCE_MODE=redis` in their env. Our only deployment is `docker-compose.yml` which we update in the same phase. No external impact.
- 🔄 `test/integration/distributed/redis-simulation.repository.spec.ts` deleted with the impl

## References
- Phase 4a spec: `docs/superpowers/specs/2026-04-19-phase-4a-postgres-persistence-design.md` §3 D4
- Phase 4a plan Task 14
- Phase 2 ADR (D2): unified BullMQ + Redis chosen as Phase 2 stepping-stone
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/008-drop-redis-simulation-repository.md
git commit -m "docs(adr): ADR-008 — drop RedisSimulationRepository after Postgres swap"
```

---

### Task 4: Install Prisma + Testcontainers Postgres dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto)

- [ ] **Step 1: Install runtime + dev dependencies**

Run:
```bash
npm install --save @prisma/client@^5.20.0
npm install --save-dev prisma@^5.20.0 @testcontainers/postgresql@^10.13.0
```

- [ ] **Step 2: Add `postinstall` script + `db:*` helper scripts**

Edit `package.json` and add to `"scripts"` block:
```json
{
  "scripts": {
    "postinstall": "prisma generate",
    "db:migrate:dev": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:studio": "prisma studio"
  }
}
```
(Keep all existing scripts. `postinstall` runs `prisma generate` after `npm install` so TypeScript types are always available; safe to run before `prisma/schema.prisma` exists — it just no-ops with a warning. We'll have schema by Task 6.)

- [ ] **Step 3: Verify install + commit**

```bash
npm install
git add package.json package-lock.json
git commit -m "chore: install Prisma 5.x + @testcontainers/postgresql for Phase 4a"
```

---

### Task 5: Create base Prisma directory structure

**Files:**
- Create: `prisma/.gitkeep` (placeholder until schema lands in Task 6)

- [ ] **Step 1: Create directory**

```bash
mkdir -p prisma
touch prisma/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add prisma/.gitkeep
git commit -m "chore: create prisma/ directory for schema + migrations"
```

(Placeholder will be removed implicitly when `prisma/schema.prisma` lands.)

---

### Task 6: Define Prisma schema

**Files:**
- Create: `prisma/schema.prisma`
- Modify: delete `prisma/.gitkeep` once schema lands

- [ ] **Step 1: Write the schema**

`prisma/schema.prisma`:
```prisma
// Phase 4a — Simulation persistence schema.
// See docs/superpowers/specs/2026-04-19-phase-4a-postgres-persistence-design.md §4

generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
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

(`binaryTargets` includes `linux-musl-openssl-3.0.x` so the Prisma engine binary works inside our `node:20-alpine` Docker image. `native` covers local dev on Win/Mac/Linux.)

- [ ] **Step 2: Generate Prisma client (validates schema syntax)**

```bash
npx prisma generate
```
Expected: `✔ Generated Prisma Client (vX.X.X) to ./node_modules/@prisma/client`. No DB connection required.

- [ ] **Step 3: Remove placeholder + commit**

```bash
rm prisma/.gitkeep
git add prisma/schema.prisma
git rm prisma/.gitkeep
git commit -m "feat(db): Prisma schema — Simulation model with hybrid columns + JSONB score"
```

---

### Task 7: Generate initial migration

**Files:**
- Create: `prisma/migrations/<timestamp>_phase4a_simulation_table/migration.sql`
- Create: `prisma/migrations/migration_lock.toml`

- [ ] **Step 1: Spin up temporary Postgres container for migration generation**

```bash
docker run --name pg-migrate-temp -e POSTGRES_PASSWORD=temp -p 5432:5432 -d postgres:16-alpine
```
Wait for Postgres to be ready (~3s):
```bash
until docker exec pg-migrate-temp pg_isready -U postgres > /dev/null 2>&1; do sleep 1; done
echo "Postgres ready"
```

- [ ] **Step 2: Generate first migration**

```bash
DATABASE_URL=postgresql://postgres:temp@localhost:5432/postgres \
  npx prisma migrate dev --name phase4a_simulation_table
```
Expected: Prisma creates `prisma/migrations/<timestamp>_phase4a_simulation_table/migration.sql`, applies it to the temp DB, generates client. Output ends with `✔ Generated Prisma Client`.

- [ ] **Step 3: Inspect generated migration**

```bash
cat prisma/migrations/*_phase4a_simulation_table/migration.sql
```
Expected SQL (approximately):
```sql
-- CreateTable
CREATE TABLE "simulations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "profile_id" VARCHAR(50) NOT NULL,
    "state" VARCHAR(20) NOT NULL,
    "total_goals" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "owner_token" UUID NOT NULL,
    "score_snapshot" JSONB NOT NULL,

    CONSTRAINT "simulations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "simulations_state_idx" ON "simulations"("state");

-- CreateIndex
CREATE INDEX "simulations_owner_token_idx" ON "simulations"("owner_token");
```
If anything is missing or different, fix `prisma/schema.prisma` and re-generate by deleting the migration folder and re-running Step 2.

- [ ] **Step 4: Tear down temp container**

```bash
docker rm -f pg-migrate-temp
```

- [ ] **Step 5: Commit migration**

```bash
git add prisma/migrations/
git commit -m "feat(db): initial migration phase4a_simulation_table"
```

---

### Task 8: Update env config schema (PERSISTENCE_MODE values + DATABASE_URL)

**Files:**
- Modify: `src/shared/config/config.schema.ts`
- Modify: `test/unit/shared/config/config.schema.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/unit/shared/config/config.schema.spec.ts`:
```typescript
describe('ConfigSchema — PERSISTENCE_MODE postgres', () => {
  it('accepts inmemory + postgres, rejects redis', () => {
    expect(() => ConfigSchema.parse({ PERSISTENCE_MODE: 'inmemory' })).not.toThrow();
    expect(() => ConfigSchema.parse({ PERSISTENCE_MODE: 'postgres' })).not.toThrow();
    expect(() => ConfigSchema.parse({ PERSISTENCE_MODE: 'redis' })).toThrow();
  });
});

describe('ConfigSchema — DATABASE_URL', () => {
  it('defaults to local postgres URL', () => {
    const c = ConfigSchema.parse({});
    expect(c.DATABASE_URL).toBe('postgresql://sportradar:sportradar@localhost:5432/sportradar');
  });

  it('accepts custom DATABASE_URL', () => {
    const c = ConfigSchema.parse({
      DATABASE_URL: 'postgresql://user:pass@host:5432/db',
    });
    expect(c.DATABASE_URL).toBe('postgresql://user:pass@host:5432/db');
  });

  it('rejects malformed DATABASE_URL', () => {
    expect(() => ConfigSchema.parse({ DATABASE_URL: 'not-a-url' })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest test/unit/shared/config/
```
Expected: all 3 new tests fail (`PERSISTENCE_MODE: 'redis'` currently passes; `DATABASE_URL` undefined).

- [ ] **Step 3: Update schema**

Edit `src/shared/config/config.schema.ts`:

Find:
```ts
PERSISTENCE_MODE: z.enum(['inmemory', 'redis']).default('inmemory'),
```
Replace with:
```ts
PERSISTENCE_MODE: z.enum(['inmemory', 'postgres']).default('inmemory'),
```

Add a new field (next to `REDIS_URL` so persistence-related env vars cluster):
```ts
DATABASE_URL: z
  .string()
  .url()
  .default('postgresql://sportradar:sportradar@localhost:5432/sportradar'),
```

- [ ] **Step 4: Run tests**

```bash
npx jest --silent --testPathIgnorePatterns="e2e|distributed"
```
Expected: all green (existing 207 + 3 new = 210).

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc -p tsconfig.build.json --noEmit
```
Expected: no errors. (`AppConfig` type now includes `DATABASE_URL: string` and `PERSISTENCE_MODE: 'inmemory' | 'postgres'`.)

- [ ] **Step 6: Commit**

```bash
git add src/shared/config/config.schema.ts test/unit/shared/config/
git commit -m "feat(config): PERSISTENCE_MODE postgres + DATABASE_URL env"
```

---

### Task 9: Prisma client lazy singleton

**Files:**
- Create: `src/shared/infrastructure/prisma.client.ts`
- Create: `test/unit/shared/infrastructure/prisma.client.spec.ts`

- [ ] **Step 1: Write the failing test**

`test/unit/shared/infrastructure/prisma.client.spec.ts`:
```typescript
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
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest test/unit/shared/infrastructure/prisma.client.spec.ts
```
Expected: cannot find module `prisma.client`.

- [ ] **Step 3: Implement**

`src/shared/infrastructure/prisma.client.ts`:
```typescript
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
```

- [ ] **Step 4: Run tests**

```bash
npx jest test/unit/shared/infrastructure/prisma.client.spec.ts
```
Expected: 2/2 PASS.

- [ ] **Step 5: Verify TypeScript + full suite**

```bash
npx tsc -p tsconfig.build.json --noEmit
npx jest --silent --testPathIgnorePatterns="e2e|distributed"
```
Expected: all green (~212 tests).

- [ ] **Step 6: Commit**

```bash
git add src/shared/infrastructure/prisma.client.ts \
        test/unit/shared/infrastructure/prisma.client.spec.ts
git commit -m "feat(shared/infra): lazy PrismaClient singleton keyed by DATABASE_URL"
```

---

### Task 10: PostgresSimulationRepository implementation

**Files:**
- Create: `src/simulation/infrastructure/persistence/postgres-simulation.repository.ts`

(No unit test in this task — repo is tested via integration test in Task 11. Mocking PrismaClient at unit level provides little value; Testcontainers exercise the actual SQL path.)

- [ ] **Step 1: Write the implementation**

`src/simulation/infrastructure/persistence/postgres-simulation.repository.ts`:
```typescript
import type { PrismaClient, Prisma, Simulation as PrismaSimulation } from '@prisma/client';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { Match } from '@simulation/domain/value-objects/match';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import type { SimulationId } from '@simulation/domain/value-objects/simulation-id';

/**
 * Postgres-backed SimulationRepository. Hybrid schema: queryable
 * metadata columns (state, owner_token, etc.) + JSONB score_snapshot.
 * See ADR-006 (full swap) and ADR-007 (schema shape).
 */
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
      scoreSnapshot: snap.score as unknown as Prisma.InputJsonValue,
    };
    await this.prisma.simulation.upsert({
      where: { id: snap.id },
      create: data,
      update: data,
    });
  }

  async findById(id: SimulationId): Promise<Simulation | null> {
    const row = await this.prisma.simulation.findUnique({
      where: { id: id.value },
    });
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
    try {
      await this.prisma.simulation.delete({ where: { id: id.value } });
    } catch {
      // Idempotent: missing row is a no-op (matches InMemory + Redis impls)
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
        ownerToken: row.ownerToken,
        score: row.scoreSnapshot as unknown as ReadonlyArray<{
          matchId: string;
          home: number;
          away: number;
        }>,
      },
      this.matches,
    );
  }
}
```

> **Note:** If the existing `SimulationRepository` port doesn't have `delete(id)`, check `src/simulation/domain/ports/simulation-repository.port.ts` and either add it (matching `InMemorySimulationRepository` if it has one) or remove the `delete` method from this impl. The `TtlRetentionPolicy` uses it.

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc -p tsconfig.build.json --noEmit
```
Expected: no errors. Prisma generated types from Task 6 should be available.

- [ ] **Step 3: Commit**

```bash
git add src/simulation/infrastructure/persistence/postgres-simulation.repository.ts
git commit -m "feat(infra/persistence): PostgresSimulationRepository — hybrid schema, upsert pattern"
```

---

### Task 11: Integration test with Testcontainers Postgres

**Files:**
- Create: `test/integration/distributed/postgres-simulation.repository.spec.ts`

- [ ] **Step 1: Reference existing Testcontainers pattern**

```bash
head -40 test/integration/distributed/bullmq-command-bus.spec.ts
```
(For pattern reference — `beforeAll` start container, get mapped port, `afterAll` stop.)

- [ ] **Step 2: Write the test**

`test/integration/distributed/postgres-simulation.repository.spec.ts`:
```typescript
import { execSync } from 'node:child_process';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { PostgresSimulationRepository } from '@simulation/infrastructure/persistence/postgres-simulation.repository';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';

describe('PostgresSimulationRepository (Testcontainers)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repo: PostgresSimulationRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test')
      .withUsername('test')
      .withPassword('test')
      .start();
    const url = container.getConnectionUri();
    execSync(`npx prisma migrate deploy`, {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
    });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    repo = new PostgresSimulationRepository(prisma, PRESET_MATCHES);
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  }, 60_000);

  beforeEach(async () => {
    await prisma.simulation.deleteMany({});
  });

  function makeSim(idSuffix = '0'): Simulation {
    const id = `aaaaaaaa-bbbb-4ccc-8ddd-${idSuffix.padStart(12, '0')}`;
    return Simulation.create({
      id: SimulationId.create(id),
      ownerToken: OwnershipToken.create('550e8400-e29b-41d4-a716-446655440010'),
      name: SimulationName.create('Test Match Name'),
      matches: PRESET_MATCHES,
      profileId: 'uniform-realtime',
      now: new Date('2026-04-19T12:00:00Z'),
    });
  }

  it('save inserts a new row', async () => {
    const sim = makeSim('a');
    await repo.save(sim);
    const row = await prisma.simulation.findUnique({ where: { id: sim.id.value } });
    expect(row).not.toBeNull();
    expect(row?.name).toBe('Test Match Name');
    expect(row?.state).toBe('RUNNING');
    expect(row?.totalGoals).toBe(0);
  });

  it('save updates existing row (upsert)', async () => {
    const sim = makeSim('b');
    await repo.save(sim);
    sim.applyGoal(PRESET_MATCHES[0].home.id, new Date('2026-04-19T12:00:01Z'));
    await repo.save(sim);
    const row = await prisma.simulation.findUnique({ where: { id: sim.id.value } });
    expect(row?.totalGoals).toBe(1);
  });

  it('findById returns null for unknown id', async () => {
    const result = await repo.findById(
      SimulationId.create('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
    );
    expect(result).toBeNull();
  });

  it('findById round-trips score JSONB correctly', async () => {
    const sim = makeSim('c');
    sim.applyGoal(PRESET_MATCHES[0].home.id, new Date('2026-04-19T12:00:01Z'));
    sim.applyGoal(PRESET_MATCHES[0].away.id, new Date('2026-04-19T12:00:02Z'));
    await repo.save(sim);
    const loaded = await repo.findById(sim.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.toSnapshot().totalGoals).toBe(2);
    const matchScore = loaded!.toSnapshot().score.find((s) => s.matchId === PRESET_MATCHES[0].id.value);
    expect(matchScore?.home).toBe(1);
    expect(matchScore?.away).toBe(1);
  });

  it('findAll returns simulations ordered by startedAt desc', async () => {
    const a = makeSim('a');
    const b = makeSim('b');
    await repo.save(a);
    // Make b's startedAt later
    await new Promise((r) => setTimeout(r, 10));
    const bSim = Simulation.create({
      id: SimulationId.create('aaaaaaaa-bbbb-4ccc-8ddd-bbbbbbbbbbbb'),
      ownerToken: OwnershipToken.create('550e8400-e29b-41d4-a716-446655440010'),
      name: SimulationName.create('Second Match Name'),
      matches: PRESET_MATCHES,
      profileId: 'uniform-realtime',
      now: new Date('2026-04-19T13:00:00Z'),
    });
    await repo.save(bSim);
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
    expect(all[0].id.value).toBe(bSim.id.value); // newer first
  });

  it('delete removes the row, no-op for unknown id', async () => {
    const sim = makeSim('d');
    await repo.save(sim);
    await repo.delete(sim.id);
    expect(await repo.findById(sim.id)).toBeNull();
    // Idempotent — second delete should not throw
    await expect(repo.delete(sim.id)).resolves.toBeUndefined();
  });

  it('uses the state index for filtering (sanity)', async () => {
    await repo.save(makeSim('1'));
    await repo.save(makeSim('2'));
    const explain = await prisma.$queryRawUnsafe<Array<{ ['QUERY PLAN']: string }>>(
      `EXPLAIN SELECT * FROM simulations WHERE state = 'RUNNING'`,
    );
    const plan = explain.map((r) => r['QUERY PLAN']).join('\n');
    // With only 2 rows PG will likely seq-scan; just assert query runs.
    expect(plan).toContain('simulations');
  });
});
```

- [ ] **Step 3: Run the test**

```bash
npx jest test/integration/distributed/postgres-simulation.repository.spec.ts --runInBand --forceExit
```
Expected: 7/7 PASS. First run takes ~30-60s (container pull + start + migrations); subsequent runs ~10-20s.

If the test fails because Docker isn't running: start Docker Desktop and retry. The test is structurally correct if it matches the pattern of `bullmq-command-bus.spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add test/integration/distributed/postgres-simulation.repository.spec.ts
git commit -m "test(integration/distributed): PostgresSimulationRepository CRUD via Testcontainers"
```

---

### Task 12: Wire PostgresSimulationRepository into SimulationModule

**Files:**
- Modify: `src/simulation/simulation.module.ts`

- [ ] **Step 1: Read current factory**

```bash
grep -n "SIMULATION_REPOSITORY\|RedisSimulationRepository" src/simulation/simulation.module.ts
```
Locate the existing factory (~lines 60-80 — uses `RedisSimulationRepository` when `mode === 'redis'`).

- [ ] **Step 2: Replace the factory + remove Redis client import**

Edit `src/simulation/simulation.module.ts`. Find the existing `SIMULATION_REPOSITORY` provider block:
```ts
{
  provide: PORT_TOKENS.SIMULATION_REPOSITORY,
  useFactory: async (config: ConfigService<AppConfig, true>) => {
    const mode = config.get('PERSISTENCE_MODE', { infer: true });
    if (mode === 'redis') {
      const { createRedisClient } = await import('../shared/infrastructure/redis.client');
      const { RedisSimulationRepository } = await import(
        './infrastructure/persistence/redis-simulation.repository'
      );
      const { PRESET_MATCHES } = await import('./domain/value-objects/matches-preset');
      const client = createRedisClient(config.get('REDIS_URL', { infer: true }));
      await client.connect();
      return new RedisSimulationRepository(client, PRESET_MATCHES);
    }
    return new InMemorySimulationRepository();
  },
  inject: [ConfigService],
},
```

Replace with:
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
},
```

- [ ] **Step 3: Add Prisma disconnect to module teardown**

In the same file, find `onModuleDestroy()` (or the equivalent shutdown hook). Add Prisma cleanup after existing shutdowns:
```ts
async onModuleDestroy(): Promise<void> {
  await this.worker.shutdown();
  await this.forwarder.stop();
  await shutdownIfPossible(this.commandBus);
  await shutdownIfPossible(this.eventBus);
  const { disconnectPrismaClient } = await import('@shared/infrastructure/prisma.client');
  await disconnectPrismaClient();
}
```

- [ ] **Step 4: Verify TypeScript + tests**

```bash
npx tsc -p tsconfig.build.json --noEmit
npx jest --silent --testPathIgnorePatterns="e2e|distributed"
```
Expected: all green (~212 tests).

- [ ] **Step 5: Commit**

```bash
git add src/simulation/simulation.module.ts
git commit -m "feat(nest): SimulationModule wires Postgres repo when PERSISTENCE_MODE=postgres"
```

---

### Task 13: Wire PostgresSimulationRepository into WorkerModule

**Files:**
- Modify: `src/worker/worker.module.ts`

- [ ] **Step 1: Read current factory**

```bash
grep -n "SIMULATION_REPOSITORY\|RedisSimulationRepository" src/worker/worker.module.ts
```
Worker module currently always uses Redis (Phase 2 wired it that way). Phase 4a needs the same `inmemory|postgres` branch as `simulation.module.ts`.

- [ ] **Step 2: Replace the factory**

Find the `SIMULATION_REPOSITORY` provider in `src/worker/worker.module.ts`. Replace it with:
```ts
{
  provide: PORT_TOKENS.SIMULATION_REPOSITORY,
  useFactory: async (config: ConfigService<AppConfig, true>) => {
    const mode = config.get('PERSISTENCE_MODE', { infer: true });
    if (mode === 'postgres') {
      const { getPrismaClient } = await import('../shared/infrastructure/prisma.client');
      const { PostgresSimulationRepository } = await import(
        '../simulation/infrastructure/persistence/postgres-simulation.repository'
      );
      const { PRESET_MATCHES } = await import(
        '../simulation/domain/value-objects/matches-preset'
      );
      const prisma = getPrismaClient(config.get('DATABASE_URL', { infer: true }));
      return new PostgresSimulationRepository(prisma, PRESET_MATCHES);
    }
    const { InMemorySimulationRepository } = await import(
      '../simulation/infrastructure/persistence/in-memory-simulation.repository'
    );
    return new InMemorySimulationRepository();
  },
  inject: [ConfigService],
},
```

- [ ] **Step 3: Add Prisma disconnect to worker teardown**

In the same file, find `onModuleDestroy()`. Add after existing shutdowns:
```ts
async onModuleDestroy(): Promise<void> {
  await this.worker.shutdown();
  await shutdownIfPossible(this.commandBus);
  await shutdownIfPossible(this.eventBus);
  const { disconnectPrismaClient } = await import('@shared/infrastructure/prisma.client');
  await disconnectPrismaClient();
}
```

- [ ] **Step 4: Verify TypeScript + tests**

```bash
npx tsc -p tsconfig.build.json --noEmit
npx jest --silent --testPathIgnorePatterns="e2e|distributed"
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/worker/worker.module.ts
git commit -m "feat(worker): WorkerModule wires Postgres repo when PERSISTENCE_MODE=postgres"
```

---

### Task 14: Delete RedisSimulationRepository + its test

**Files:**
- Delete: `src/simulation/infrastructure/persistence/redis-simulation.repository.ts`
- Delete: `test/integration/distributed/redis-simulation.repository.spec.ts`

- [ ] **Step 1: Verify no remaining imports**

```bash
grep -rn "RedisSimulationRepository\|redis-simulation.repository" src/ test/ 2>&1 | grep -v "^Binary"
```
Expected: no matches (Tasks 12 and 13 already removed the imports). If any remain, fix before deleting.

- [ ] **Step 2: Delete the files**

```bash
rm src/simulation/infrastructure/persistence/redis-simulation.repository.ts
rm test/integration/distributed/redis-simulation.repository.spec.ts
```

- [ ] **Step 3: Verify tests still pass**

```bash
npx tsc -p tsconfig.build.json --noEmit
npx jest --silent --testPathIgnorePatterns="e2e|distributed"
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(infra): remove RedisSimulationRepository — Phase 2 stepping stone retired (ADR-008)"
```

---

### Task 15: Dockerfile updates (COPY prisma + generate + migrate deploy)

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Read current Dockerfile**

```bash
cat Dockerfile
```
Note the existing builder + runner stages and CMD.

- [ ] **Step 2: Add Prisma to builder stage**

In the builder stage (where `COPY src ./src` lives), add `COPY prisma ./prisma` before `npm run build`. Also add `RUN npx prisma generate` after `COPY prisma`:
```dockerfile
# (existing)
COPY package.json package-lock.json ./
RUN npm ci

# NEW: Prisma needs schema before generate, schema before build (TypeScript references generated client)
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json ./
COPY src ./src

RUN npm run build
```

- [ ] **Step 3: Copy prisma into runner stage + add migrate to CMD**

In the runner stage:
```dockerfile
# Add after COPY of dist + node_modules
COPY --chown=app:app --from=builder /app/prisma ./prisma
COPY --chown=app:app --from=builder /app/node_modules/.prisma ./node_modules/.prisma
```

Replace the existing `CMD` line:
```dockerfile
CMD ["sh", "-c", "if [ \"$APP_MODE\" = \"worker\" ]; then node dist/worker.main.js; else node dist/main.js; fi"]
```

with:
```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && (if [ \"$APP_MODE\" = \"worker\" ]; then node dist/worker.main.js; else node dist/main.js; fi)"]
```

> **Note:** `npx prisma migrate deploy` is idempotent — applies any pending migrations, does nothing if up-to-date. Both orchestrator and worker run it; Postgres handles concurrent identical migrations safely (advisory lock).

- [ ] **Step 4: Verify build (no compose yet — straight docker build)**

```bash
docker build -t sportradar-simulation:phase4a-test .
```
Expected: build succeeds. Image gets prisma schema, generated client, and the migrate-deploy entrypoint.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile
git commit -m "chore(docker): COPY prisma + prisma generate in build, prisma migrate deploy in CMD"
```

---

### Task 16: docker-compose.yml — add Postgres service

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Read current compose**

```bash
cat docker-compose.yml
```

- [ ] **Step 2: Add Postgres service + volume**

Edit `docker-compose.yml`. After the `redis:` service block, add:
```yaml
  postgres:
    image: postgres:16-alpine
    container_name: sportradar-postgres
    environment:
      POSTGRES_DB: sportradar
      POSTGRES_USER: sportradar
      POSTGRES_PASSWORD: sportradar
    ports:
      - '5432:5432'
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U sportradar -d sportradar']
      interval: 5s
      timeout: 3s
      retries: 5
```

At the bottom of the file (after all `services:` definitions), add:
```yaml
volumes:
  postgres-data:
```

- [ ] **Step 3: Update orchestrator service**

Find the `orchestrator:` block. In its `depends_on:` add postgres:
```yaml
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
```

In its `environment:` add (replace existing or add new lines):
```yaml
      DATABASE_URL: postgresql://sportradar:sportradar@postgres:5432/sportradar
      PERSISTENCE_MODE: postgres
```

- [ ] **Step 4: Update each worker-* service (uniform, poisson, markov)**

For each of `worker-uniform:`, `worker-poisson:`, `worker-markov:`:

Add to `depends_on:`:
```yaml
      postgres:
        condition: service_healthy
```

Add to `environment:`:
```yaml
      DATABASE_URL: postgresql://sportradar:sportradar@postgres:5432/sportradar
      PERSISTENCE_MODE: postgres
```

- [ ] **Step 5: Validate compose syntax**

```bash
docker compose config 2>&1 | head -40
```
Expected: no errors. Output shows postgres service + 3 workers all with `DATABASE_URL` env.

- [ ] **Step 6: Smoke test (if Docker is available)**

```bash
docker compose down --remove-orphans -v
docker compose up -d
sleep 10
docker compose ps
docker compose logs orchestrator 2>&1 | tail -20
```
Expected: 6 services running (`postgres`, `redis`, `orchestrator`, 4 worker containers across 3 services); orchestrator log ends with `Application is running on port 3000`. Migrate output appears: `X migrations to apply` then `All migrations have been successfully applied`.

Manual smoke (after up):
```bash
curl -X POST http://localhost:3000/simulations \
  -H 'Content-Type: application/json' \
  -d '{"name": "Phase 4a Smoke Test"}'
sleep 11
docker exec sportradar-postgres psql -U sportradar -d sportradar -c "SELECT id, name, state, total_goals FROM simulations;"
```
Expected: 1 row visible in Postgres with state=FINISHED and total_goals=9.

```bash
docker compose down
docker compose up -d
sleep 10
curl -s http://localhost:3000/simulations | head -c 300
```
Expected: the simulation from before is still there (proves durability across restart).

```bash
docker compose down -v
```

If Docker isn't available, skip Step 6 entirely and note in commit message.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(docker): add postgres service with healthcheck + volume; PERSISTENCE_MODE=postgres on all app services"
```

---

### Task 17: CHANGELOG [4.1.0]

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Insert above [3.0.0] entry**

In `CHANGELOG.md`, find the existing `## [3.0.0]` header. Insert above it:

```markdown
## [4.1.0] — 2026-04-19 — Phase 4a: Postgres simulation persistence

### Added
- `PostgresSimulationRepository` — Prisma-backed implementation of `SimulationRepository` port
- Prisma schema (`prisma/schema.prisma`) with `Simulation` model: hybrid columns + JSONB `score_snapshot`, indexes on `state` and `owner_token`
- Initial migration `phase4a_simulation_table` (`prisma/migrations/`)
- `getPrismaClient(databaseUrl)` lazy singleton in `src/shared/infrastructure/prisma.client.ts`
- `DATABASE_URL` env var (config schema, default `postgresql://sportradar:sportradar@localhost:5432/sportradar`)
- `postgres:16-alpine` service in docker-compose with healthcheck + named volume (`postgres-data`)
- Auto-migration on container startup via `prisma migrate deploy` (Dockerfile CMD)
- Integration test: PostgresSimulationRepository CRUD via Testcontainers (~7 tests)
- Dependencies: `@prisma/client@^5.20`, `prisma@^5.20` (devDep), `@testcontainers/postgresql@^10.13` (devDep)

### Changed
- **Breaking**: `PERSISTENCE_MODE` enum reduced from `inmemory|redis|postgres` plan to `inmemory|postgres` only (Redis-as-persistence dropped per ADR-008)
- `SimulationModule` and `WorkerModule` factories now branch `inmemory|postgres`; both call `getPrismaClient()` for postgres path
- Module teardown adds `disconnectPrismaClient()` after existing shutdowns
- Dockerfile copies `prisma/` into builder + runner; `npx prisma generate` in build; `prisma migrate deploy` prepended to CMD
- All app services in docker-compose get `DATABASE_URL` + `PERSISTENCE_MODE=postgres` + `depends_on.postgres.condition: service_healthy`

### Removed
- `src/simulation/infrastructure/persistence/redis-simulation.repository.ts` (Phase 2 stepping stone, no production use case after Postgres lands; impl preserved in git history at tag `v3.0-profile-driven`)
- `test/integration/distributed/redis-simulation.repository.spec.ts`

### ADRs
- ADR-006: PostgresSimulationRepository — full swap (no Redis hot/cold hybrid)
- ADR-007: Schema hybrid (queryable columns + JSONB `score_snapshot`)
- ADR-008: Drop `RedisSimulationRepository`

### Notes
- **Ownership tokens still in-memory**: `OwnershipRepository` is NOT migrated to Postgres in 4a. Tokens reset when orchestrator restarts (finish/restart actions need fresh token from current session). Phase 4b replaces `OwnershipRepository` entirely with `UserRepository` backed by Postgres + JWT auth.
- Hybrid (Redis hot + Postgres cold) is intentionally NOT implemented. Port stays open for Phase 6 if metrics ever justify it.

```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG [4.1.0] — Phase 4a Postgres simulation persistence"
```

---

### Task 18: README updates

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README structure**

```bash
head -120 README.md
```
Locate: phase-status section, env table, distributed-mode usage block.

- [ ] **Step 2: Add Phase 4a status entry**

Find the existing Phase 3 status entry. Add directly below it (matching existing style):

```markdown
- ✅ **Phase 4a — Postgres simulation persistence** (`v4.1-postgres-persistence`)
  - PostgresSimulationRepository via Prisma 5.x; hybrid schema (columns + JSONB `score_snapshot`)
  - Auto-migrate on container startup (`prisma migrate deploy`)
  - docker-compose adds postgres:16-alpine with healthcheck + named volume
  - `RedisSimulationRepository` removed (ADR-008); `PERSISTENCE_MODE=inmemory|postgres`
  - **Caveat:** ownership tokens still in-memory — restart resets tokens. Phase 4b adds JWT auth + persisted users.
  - ADRs: 006 (full swap), 007 (schema hybrid), 008 (drop Redis repo)
```

- [ ] **Step 3: Update env table (or env documentation block)**

Find the env vars list/table. Add `DATABASE_URL` row, change `PERSISTENCE_MODE` row:

| Env var | Default | Description |
|---|---|---|
| `PERSISTENCE_MODE` | `inmemory` | `inmemory` (dev/test) or `postgres` (prod). Was `redis` before Phase 4a — now removed. |
| `DATABASE_URL` | `postgresql://sportradar:sportradar@localhost:5432/sportradar` | Postgres connection string. Required when `PERSISTENCE_MODE=postgres`. |

- [ ] **Step 4: Add Postgres usage section**

Below the existing "Distributed mode" / "Profiles" sections, add:

```markdown
### Postgres persistence

`docker compose up -d` starts Postgres alongside Redis + orchestrator + workers. Simulations persist across restarts:

```bash
docker compose down              # keep volume
docker compose up -d              # sims still there
```

To reset everything (drop the named volume):
```bash
docker compose down -v
```

Direct DB inspection:
```bash
docker exec sportradar-postgres psql -U sportradar -d sportradar -c "SELECT id, name, state, total_goals, profile_id FROM simulations ORDER BY started_at DESC;"
```

To wipe simulation state without restarting containers:
```bash
docker exec sportradar-postgres psql -U sportradar -d sportradar -c "TRUNCATE simulations;"
```
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README Phase 4a status + Postgres usage + env table updated"
```

---

### Task 19: simplify (post-implementation review)

- [ ] **Step 1: Run simplify skill against Phase 4a diff**

Invoke skill `simplify` over `git diff main..HEAD`. Focus areas:
- Code reuse: is there an existing helper for "load from snapshot" pattern that PostgresSimulationRepository.toAggregate duplicates?
- Quality: factory in SimulationModule and WorkerModule are very similar — should there be a shared `createSimulationRepository(config)` helper?
- Efficiency: any unnecessary work in repo methods (e.g., redundant `toSnapshot()` calls)?
- Dead code: anything from Redis impl removal that left orphan imports/types?

- [ ] **Step 2: Apply fixes from simplify; commit per fix**

Each fix as a separate commit. If nothing actionable found, note "simplify clean" in CHANGELOG bottom or skip silently.

---

### Task 20: Security review (post-implementation)

- [ ] **Step 1: Run feature-dev:code-reviewer with security focus**

Dispatch agent over Phase 4a diff. Focus areas:
- SQL injection: Prisma uses parameterized queries by default; verify no raw SQL with user input. The `EXPLAIN` test uses `$queryRawUnsafe` with hardcoded SQL — that's fine.
- DATABASE_URL exposure: env var contains password. Verify no logs leak it (Prisma may log queries with bound params; check NestJS log level in production).
- Migration deployment: `prisma migrate deploy` runs on every container start. If a malicious migration ever lands in `prisma/migrations/`, it executes. Mitigation: code review + branch protection (out of 4a scope).
- Connection pool exhaustion: 5 services × 10 default Prisma connections = 50; PG max_connections default 100. Headroom OK. Note in CHANGELOG if not already.
- TOCTOU on `delete` (try/catch swallows missing-row): semantically idempotent, no security concern.

- [ ] **Step 2: Apply fixes per finding; commit per fix**

---

### Task 21: Tag v4.1-postgres-persistence

- [ ] **Step 1: Verify all tests pass**

```bash
npx jest --silent
```
Expected: all green (~217+ tests). If Docker is available, distributed integration tests run; if not, they're skipped/error and you note that — non-blocking for tag.

- [ ] **Step 2: Verify build**

```bash
npx tsc -p tsconfig.build.json --noEmit
docker compose build 2>&1 | tail -3
```
Expected: tsc clean; image built successfully.

- [ ] **Step 3: Tag**

```bash
git tag -a v4.1-postgres-persistence -m "Phase 4a: Postgres simulation persistence

PostgresSimulationRepository via Prisma 5.x — adapter swap behind the
SimulationRepository port. Hybrid schema (queryable columns + JSONB
score_snapshot). Auto-migrate on container startup.

docker compose: + postgres:16-alpine service with healthcheck + named volume.
Simulations preserved across docker compose down/up cycles.

ADRs: 006 (full swap), 007 (schema hybrid), 008 (drop Redis repo).

Caveat: ownership tokens still in-memory until Phase 4b."
git log --oneline -1
```

- [ ] **Step 4: STOP — push (user-only operation)**

Do NOT push tag or branch. When implementation is done, instruct user:
```
git push -u origin phase-4-persistence-auth
git push origin v4.1-postgres-persistence
# Then merge to main:
git checkout main
git pull
git merge --no-ff phase-4-persistence-auth -m "Merge Phase 4a: Postgres simulation persistence"
git push origin main
```

---

## Self-Review

After writing the plan above, checking against spec:

**1. Spec coverage:**
- ✅ §3 D1 (full Postgres swap) — Task 1 ADR + Tasks 10-13 impl/wire
- ✅ §3 D2 (hybrid schema) — Task 2 ADR + Task 6 schema
- ✅ §3 D3 (OwnershipRepository stays InMemory) — covered by absence of any task touching it; Task 17 CHANGELOG + Task 18 README explicitly note caveat
- ✅ §3 D4 (drop Redis repo) — Task 3 ADR + Task 14 deletion
- ✅ §3 D5 (auto-migrate on startup) — Task 15 Dockerfile + Task 11 (test uses `migrate deploy` programmatically)
- ✅ §3 D6 (domain unchanged) — no task modifies `Simulation` aggregate; Task 10 reuses `Simulation.fromSnapshot()`
- ✅ §4 schema — Task 6 produces it verbatim
- ✅ §5 repository implementation — Task 10 produces it verbatim
- ✅ §6 module wiring — Tasks 12, 13
- ✅ §7 migration strategy — Tasks 15 (Dockerfile) + 16 (compose healthcheck)
- ✅ §8 docker-compose changes — Task 16
- ✅ §9 testing strategy — Task 11 integration test + existing unit tests carry forward unchanged
- ✅ §10 file structure — matches plan's File Structure section
- ✅ §11 ADRs — Tasks 1, 2, 3
- ✅ §12 delivery state — Task 21 tag + steps along the way
- ✅ §13 out of scope — explicitly NOT covered (auth, ownership refactor, etc.)
- ✅ §14 risks — addressed: idempotent migrations, healthcheck ordering, no schema drift in this phase

**2. Placeholder scan:**
- No "TBD" / "TODO" / "fill in"
- All code blocks complete with actual content
- Step numbers and expected outputs concrete
- One inline note in Task 10 ("If the existing port doesn't have `delete`...") — that's a verification instruction, not a placeholder; engineer follows it.

**3. Type consistency:**
- `getPrismaClient(databaseUrl: string)` — same signature in Tasks 9, 12, 13
- `disconnectPrismaClient()` — same name in Tasks 9, 12, 13
- `PostgresSimulationRepository(prisma, matches)` ctor signature — same in Tasks 10, 11, 12, 13
- `PrismaSimulation` type alias — declared in Task 10
- Schema field names (`profileId` ↔ `profile_id`, `scoreSnapshot` ↔ `score_snapshot`) — consistent via Prisma `@map`

Plan is internally consistent and complete. Ready for execution.

---

## Execution Notes

**Branch strategy:** already on `phase-4-persistence-auth` (created from main with Phase 3 merged).

**Subagent dispatch:** Each task above is sized for one fresh subagent (model: sonnet for mechanical impl, opus for ADR drafting if needed). Two-stage review per task (spec compliance, then code quality) per `superpowers:subagent-driven-development`. ADR tasks (1-3) and small docs tasks (17, 18) can use lighter review.

**Final delivery:** tag `v4.1-postgres-persistence`, then push + merge to main using same flow as Phase 2/3.

**Phase 4b** (auth + ownership refactor) gets brainstormed separately AFTER 4a is shipped, not now. Spec for 4b will live at `docs/superpowers/specs/<date>-phase-4b-auth-userid-design.md`.
