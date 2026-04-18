# Phase 2 — BullMQ Distributed Workers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap in-memory adapters (`InMemoryCommandBus`, `InMemoryEventBus`, `InMemorySimulationRepository`) na **BullMQ + Redis** + wyciągnąć worker do osobnego entrypointa (`src/worker.main.ts`). Zero zmian w kodzie biznesowym (orchestrator, domain, engine, dynamics). Testy unit pozostają bez zmian; integration/E2E mają wariant z Testcontainers (real Redis). docker-compose.yml rośnie do 3 services: `redis` + `orchestrator` + `worker` (N replik). Delivery state: tag `v2.0-bullmq-distributed`, full flow działa w distributed mode, Bull Board UI dostępny na `/queues`.

**Architecture:** Orchestrator + N workerów + Redis (BullMQ queues + Redis JSON dla SimulationRepository). CommandBus i EventBus używają BullMQ queues (unified transport per decyzja z brainstormingu). OwnershipRepository pozostaje InMemory (tylko orchestrator jej potrzebuje). Worker = standalone NestJS app bez controllerów/gateway'a. Profile selection (Phase 3) domyślnie `default`.

**Tech Stack:** BullMQ 5.x, ioredis 5.x, `@nestjs/bullmq` 10.x, `@bull-board/api` + `@bull-board/express` + `@bull-board/nestjs` (UI), `testcontainers` 10.x (Node) + `@testcontainers/redis`, istniejący stack (NestJS 10, TypeScript, Jest).

**Spec reference:** `docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md` §7 (Message bus & worker model), §9 Phase 2.

**Phase 1 state (input):** tag `v1.0-mvp-in-process`, 185 tests passing, domain + infra + gateway + integration/E2E tests all green. Full MVP w single-process.

**Phase 2 delivery state (expected):**
- ~210+ total tests (185 carried + ~25 new Testcontainers-based)
- `v2.0-bullmq-distributed` git tag
- docker-compose up startuje 3 services, full flow działa przez Redis
- Bull Board UI at `http://localhost:3000/queues`
- Unit tests niezmienione (`npm test` nadal <10s bez Redis)
- Post-impl: simplify + security review

---

## Key design decisions for Phase 2

### D1. Shared persistence: Redis-backed SimulationRepository

Worker i orchestrator żyją w osobnych procesach. Aggregaty muszą być współdzielone. Wybór: **Redis JSON** (`HSET` z pełnym snapshot) przez `ioredis`.

### D2+D3. Transport: BullMQ dla obu (CommandBus + EventBus)

Jedna biblioteka, jeden Redis, spójny stack. BullMQ's queue semantics (1 message → 1 consumer) OK dla Phase 2 bo:
- 1 orchestrator instance = 1 event consumer (WsEventForwarder)
- N workers na partition by profile (route commands via topic queue name)

Phase 3+ gdy multi-orchestrator — wtedy swap EventBus na Redis pub/sub (port już definiowany).

### D4. Worker entrypoint

`src/worker.main.ts` — standalone NestJS app. Ten sam Docker image; CMD wybiera `main.js` vs `worker.main.js` na podstawie `APP_MODE` env (default `orchestrator`).

### D5. Testing

- Unit: bez zmian, InMemory adapters (fast, <5ms per test)
- Integration: dodajemy `test/integration/distributed/` z Testcontainers. Redis container startuje per suite. Tests real BullMQ + Redis repo.
- E2E: one distributed test uruchamia całość via `docker compose up` + supertest + socket.io-client (manual run, nie w jest suite)

### D6. Ownership persistence

`OwnershipRepository` pozostaje **InMemory** (w procesie orchestratora). Worker nie potrzebuje ownership lookup. Phase 3+ gdy multi-orchestrator może przenieść na Redis.

### D7. Simulation.fromSnapshot static method

Aby deserializować aggregate z Redis JSON, potrzebujemy reconstruction factory. Signature:
```typescript
static fromSnapshot(snap: SimulationSnapshot, matches: readonly Match[]): Simulation
```
Matches przekazywane z zewnątrz (orchestrator/worker używa `PRESET_MATCHES`). Phase 3 profile-driven dynamics może mieć własne matches.

---

## File structure (Phase 2 creates/modifies)

```
src/
├── shared/
│   ├── infrastructure/
│   │   └── redis.client.ts                        (new — shared ioredis client provider)
│   └── messaging/
│       ├── bullmq-command-bus.ts                  (new — adapter)
│       └── bullmq-event-bus.ts                    (new — adapter)
├── simulation/
│   ├── domain/
│   │   └── aggregates/
│   │       └── simulation.ts                      (modify — add fromSnapshot)
│   └── infrastructure/
│       └── persistence/
│           └── redis-simulation.repository.ts     (new)
├── worker/                                        (new bounded context for worker module)
│   └── worker.module.ts                           (new — minimal NestJS module for worker process)
├── main.ts                                        (modify — Bull Board mount, APP_MODE check)
├── worker.main.ts                                 (new — worker entrypoint)
└── simulation/
    └── simulation.module.ts                       (modify — env-based adapter selection)

test/
├── integration/
│   └── distributed/
│       ├── bullmq-command-bus.spec.ts             (new, Testcontainers)
│       ├── bullmq-event-bus.spec.ts               (new, Testcontainers)
│       └── redis-simulation.repository.spec.ts    (new, Testcontainers)
└── e2e/
    └── distributed-flow.manual.md                 (new — script + curl for manual E2E demo)

docker-compose.yml                                 (modify — add redis + worker services)
Dockerfile                                         (modify — multi-entrypoint via APP_MODE)
src/shared/config/config.schema.ts                 (modify — add REDIS_URL, TRANSPORT_MODE, PERSISTENCE_MODE)
```

---

## Task 1: Install BullMQ + ioredis + Bull Board + Testcontainers

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install runtime deps**

```bash
npm install bullmq@^5 ioredis@^5 @nestjs/bullmq@^10
npm install @bull-board/api@^6 @bull-board/express@^6 @bull-board/nestjs@^6
```

- [ ] **Step 2: Install dev deps (Testcontainers)**

```bash
npm install --save-dev testcontainers@^10 @testcontainers/redis@^10
```

- [ ] **Step 3: Verify**

```bash
npm ls --depth=0 | grep -E "(bullmq|ioredis|bull-board|testcontainers)"
```
Expected: all packages listed, no UNMET DEPENDENCY.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install BullMQ + ioredis + Bull Board + Testcontainers for Phase 2

- bullmq + ioredis + @nestjs/bullmq: CommandBus + EventBus Redis-backed transport
- @bull-board/* family: queue UI at /queues for demo
- testcontainers + @testcontainers/redis: real Redis in integration tests"
```

---

## Task 2: Simulation.fromSnapshot + ScoreBoard.fromSnapshot

**Files:**
- Modify: `src/simulation/domain/aggregates/simulation.ts`
- Modify: `src/simulation/domain/value-objects/score-board.ts`
- Modify: `test/unit/domain/aggregates/simulation.spec.ts`
- Modify: `test/unit/domain/value-objects/score-board.spec.ts`

- [ ] **Step 1: Add ScoreBoard.fromSnapshot**

Modify `src/simulation/domain/value-objects/score-board.ts`. Add static method:
```typescript
  static fromSnapshot(snapshot: readonly MatchScoreSnapshot[], matches: readonly Match[]): ScoreBoard {
    const byMatchId = new Map(matches.map((m) => [m.id.value, m]));
    const scores = snapshot.map((entry) => {
      const match = byMatchId.get(entry.matchId);
      if (!match) {
        throw new InvalidValueError('ScoreBoard', `match id not in matches list`, entry.matchId);
      }
      return { match, home: entry.home, away: entry.away };
    });
    return new ScoreBoard(scores);
  }
```

- [ ] **Step 2: Add test for ScoreBoard.fromSnapshot**

Append to `test/unit/domain/value-objects/score-board.spec.ts`:
```typescript
describe('ScoreBoard.fromSnapshot', () => {
  const germany = Team.create(TeamId.create('germany'), 'Germany');
  const poland = Team.create(TeamId.create('poland'), 'Poland');
  const m1 = Match.create(MatchId.create('m1'), germany, poland);

  it('reconstructs ScoreBoard from snapshot + matches list', () => {
    const original = ScoreBoard.fromMatches([m1]).increment(TeamId.create('germany'));
    const snap = original.snapshot();
    const restored = ScoreBoard.fromSnapshot(snap, [m1]);
    expect(restored.snapshot()).toEqual(snap);
    expect(restored.totalGoals()).toBe(1);
  });

  it('throws when snapshot has unknown matchId', () => {
    expect(() => ScoreBoard.fromSnapshot([{ matchId: 'unknown', home: 1, away: 0 }], [m1])).toThrow();
  });
});
```

- [ ] **Step 3: Add Simulation.fromSnapshot**

Modify `src/simulation/domain/aggregates/simulation.ts`. Add static method after `create`:
```typescript
  static fromSnapshot(snapshot: SimulationSnapshot, matches: readonly Match[]): Simulation {
    const sim = new Simulation(
      SimulationId.create(snapshot.id),
      OwnershipToken.create(snapshot.ownerToken),
      SimulationName.create(snapshot.name),
      snapshot.profileId,
      snapshot.state,
      ScoreBoard.fromSnapshot(snapshot.score, matches),
      new Date(snapshot.startedAt),
      snapshot.finishedAt ? new Date(snapshot.finishedAt) : null,
      snapshot.totalGoals,
    );
    return sim;
  }
```

Note: imports for `SimulationId`, `OwnershipToken`, `SimulationName`, `ScoreBoard` — may need to change from `type` to value imports (or add new value imports). Check existing imports and adjust.

- [ ] **Step 4: Add test for Simulation.fromSnapshot**

Append to `test/unit/domain/aggregates/simulation.spec.ts`:
```typescript
describe('Simulation.fromSnapshot', () => {
  const id = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
  const token = OwnershipToken.create('550e8400-e29b-41d4-a716-446655440001');
  const name = SimulationName.create('Katar 2023');
  const start = new Date('2026-04-18T12:00:00Z');

  it('round-trips via toSnapshot + fromSnapshot (RUNNING, no goals)', () => {
    const orig = Simulation.create({ id, ownerToken: token, name, matches: PRESET_MATCHES, profileId: 'default', now: start });
    orig.pullEvents();
    const snap = orig.toSnapshot();
    const restored = Simulation.fromSnapshot(snap, PRESET_MATCHES);
    expect(restored.toSnapshot()).toEqual(snap);
  });

  it('round-trips after goals + finish', () => {
    const orig = Simulation.create({ id, ownerToken: token, name, matches: PRESET_MATCHES, profileId: 'default', now: start });
    orig.applyGoal(TeamId.create('germany'), new Date(start.getTime() + 1000));
    orig.applyGoal(TeamId.create('poland'), new Date(start.getTime() + 2000));
    orig.finish('auto', new Date(start.getTime() + 9000));
    orig.pullEvents();
    const snap = orig.toSnapshot();
    const restored = Simulation.fromSnapshot(snap, PRESET_MATCHES);
    expect(restored.toSnapshot()).toEqual(snap);
  });

  it('restored aggregate emits events correctly on further mutation', () => {
    const orig = Simulation.create({ id, ownerToken: token, name, matches: PRESET_MATCHES, profileId: 'default', now: start });
    orig.pullEvents();
    const restored = Simulation.fromSnapshot(orig.toSnapshot(), PRESET_MATCHES);
    restored.applyGoal(TeamId.create('germany'), new Date(start.getTime() + 1000));
    const events = restored.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('GoalScored');
  });
});
```

- [ ] **Step 5: Run + commit**

```bash
npm test -- simulation.spec score-board.spec
npm run lint && npx tsc --noEmit
git add src/simulation/domain/aggregates/simulation.ts src/simulation/domain/value-objects/score-board.ts test/unit/domain/aggregates/simulation.spec.ts test/unit/domain/value-objects/score-board.spec.ts
git commit -m "feat(domain): Simulation.fromSnapshot + ScoreBoard.fromSnapshot reconstruction

- Needed for Redis-backed repository serialization in Phase 2
- Simulation.fromSnapshot(snap, matches): full round-trip with toSnapshot
- ScoreBoard.fromSnapshot(snap, matches): throws on unknown matchId
- 5 new tests covering round-trip, post-restoration mutations, error cases"
```

---

## Task 3: Extend config schema with Redis + transport mode env vars

**Files:**
- Modify: `src/shared/config/config.schema.ts`

- [ ] **Step 1: Add new env vars to schema**

Modify `src/shared/config/config.schema.ts` — append new fields inside `z.object`:
```typescript
  // Phase 2+ — Redis + transport selection
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  TRANSPORT_MODE: z.enum(['inmemory', 'bullmq']).default('inmemory'),
  PERSISTENCE_MODE: z.enum(['inmemory', 'redis']).default('inmemory'),
  APP_MODE: z.enum(['orchestrator', 'worker']).default('orchestrator'),
  BULL_BOARD_ENABLED: z.coerce.boolean().default(true),
```

**IMPORTANT**: insert these BEFORE the closing `});` of `ConfigSchema`.

- [ ] **Step 2: Verify typecheck + commit**

```bash
npx tsc --noEmit && npm run lint && npm test
git add src/shared/config/config.schema.ts
git commit -m "feat(config): Phase 2 env vars — REDIS_URL, TRANSPORT_MODE, PERSISTENCE_MODE, APP_MODE, BULL_BOARD_ENABLED

- Defaults: inmemory/inmemory/orchestrator/true (backward compat with Phase 1)
- Production: docker-compose will set to bullmq/redis/{worker|orchestrator}"
```

---

## Task 4: Shared Redis client provider

**Files:**
- Create: `src/shared/infrastructure/redis.client.ts`
- Create: `test/unit/shared/infrastructure/redis.client.spec.ts` (skipped if no Redis)

- [ ] **Step 1: Failing test (will be skipped without Redis)**

`test/unit/shared/infrastructure/redis.client.spec.ts`:
```typescript
import { createRedisClient } from '@shared/infrastructure/redis.client';

describe('createRedisClient', () => {
  it('creates an ioredis instance with provided URL', () => {
    const client = createRedisClient('redis://localhost:6379');
    expect(client).toBeDefined();
    expect(typeof client.ping).toBe('function');
    client.disconnect();
  });

  it('lazyConnect option defers connection (no error on creation)', () => {
    const client = createRedisClient('redis://invalid-host:9999');
    expect(client).toBeDefined();
    client.disconnect();
  });
});
```

- [ ] **Step 2: Implement**

`src/shared/infrastructure/redis.client.ts`:
```typescript
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
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- redis.client.spec
npm run lint && npx tsc --noEmit
git add src/shared/infrastructure/redis.client.ts test/unit/shared/infrastructure/redis.client.spec.ts
git commit -m "feat(shared): Redis client factory with lazyConnect + maxRetriesPerRequest: null

- Returns ioredis instance used by BullMQ (required config) and RedisSimulationRepository
- Lazy connection avoids crashes during module bootstrap when Redis is down"
```

---

## Task 5: RedisSimulationRepository (Testcontainers-backed test)

**Files:**
- Create: `src/simulation/infrastructure/persistence/redis-simulation.repository.ts`
- Create: `test/integration/distributed/redis-simulation.repository.spec.ts`

- [ ] **Step 1: Failing integration test (Testcontainers)**

`test/integration/distributed/redis-simulation.repository.spec.ts`:
```typescript
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { RedisSimulationRepository } from '@simulation/infrastructure/persistence/redis-simulation.repository';
import { createRedisClient, type RedisClient } from '@shared/infrastructure/redis.client';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';

jest.setTimeout(60_000);

describe('RedisSimulationRepository (Testcontainers)', () => {
  let container: StartedTestContainer;
  let client: RedisClient;
  let repo: RedisSimulationRepository;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
    client = createRedisClient(url);
    await client.connect();
    repo = new RedisSimulationRepository(client, PRESET_MATCHES);
  });

  afterAll(async () => {
    await client.quit();
    await container.stop();
  });

  beforeEach(async () => {
    await client.flushdb();
  });

  function makeSim(idStr: string, tokenStr: string, name = 'Katar 2023'): Simulation {
    return Simulation.create({
      id: SimulationId.create(idStr),
      ownerToken: OwnershipToken.create(tokenStr),
      name: SimulationName.create(name),
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: new Date('2026-04-18T12:00:00Z'),
    });
  }

  const id1 = '550e8400-e29b-41d4-a716-446655440000';
  const id2 = '550e8400-e29b-41d4-a716-446655440002';
  const tokA = '550e8400-e29b-41d4-a716-446655440010';
  const tokB = '550e8400-e29b-41d4-a716-446655440011';

  it('findById returns null when not saved', async () => {
    const r = await repo.findById(SimulationId.create(id1));
    expect(r).toBeNull();
  });

  it('save + findById round-trip preserves snapshot', async () => {
    const orig = makeSim(id1, tokA);
    await repo.save(orig);
    const loaded = await repo.findById(SimulationId.create(id1));
    expect(loaded).not.toBeNull();
    expect(loaded!.toSnapshot()).toEqual(orig.toSnapshot());
  });

  it('findAll returns all saved simulations', async () => {
    await repo.save(makeSim(id1, tokA));
    await repo.save(makeSim(id2, tokB));
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.id.value).sort()).toEqual([id1, id2].sort());
  });

  it('findByOwner filters correctly', async () => {
    await repo.save(makeSim(id1, tokA));
    await repo.save(makeSim(id2, tokB));
    const byA = await repo.findByOwner(OwnershipToken.create(tokA));
    expect(byA).toHaveLength(1);
    expect(byA[0].id.value).toBe(id1);
  });

  it('delete removes entry', async () => {
    await repo.save(makeSim(id1, tokA));
    await repo.delete(SimulationId.create(id1));
    const r = await repo.findById(SimulationId.create(id1));
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

`src/simulation/infrastructure/persistence/redis-simulation.repository.ts`:
```typescript
import type { Simulation, SimulationSnapshot } from '@simulation/domain/aggregates/simulation';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import type { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import type { Match } from '@simulation/domain/value-objects/match';
import { Simulation as SimulationClass } from '@simulation/domain/aggregates/simulation';
import type { RedisClient } from '@shared/infrastructure/redis.client';

/**
 * Redis-backed SimulationRepository.
 * - Storage: HSET `simulations` with field = simulationId, value = JSON snapshot.
 *   findAll uses HVALS; findByOwner filters in memory (acceptable at MVP scale,
 *   Phase 4 will switch to Postgres with proper indexes).
 * - Aggregate reconstruction uses `PRESET_MATCHES` (or later, profile-specific matches).
 */
export class RedisSimulationRepository implements SimulationRepository {
  private readonly HASH_KEY = 'simulations';

  constructor(
    private readonly client: RedisClient,
    private readonly matches: readonly Match[],
  ) {}

  async save(simulation: Simulation): Promise<void> {
    const snap = simulation.toSnapshot();
    await this.client.hset(this.HASH_KEY, snap.id, JSON.stringify(this.serialize(snap)));
  }

  async findById(id: SimulationId): Promise<Simulation | null> {
    const raw = await this.client.hget(this.HASH_KEY, id.value);
    if (raw === null) return null;
    return this.deserialize(JSON.parse(raw) as SerializedSnapshot);
  }

  async findAll(): Promise<readonly Simulation[]> {
    const all = await this.client.hvals(this.HASH_KEY);
    return all.map((raw) => this.deserialize(JSON.parse(raw) as SerializedSnapshot));
  }

  async findByOwner(token: OwnershipToken): Promise<readonly Simulation[]> {
    const all = await this.findAll();
    return all.filter((s) => s.ownerToken.equals(token));
  }

  async delete(id: SimulationId): Promise<void> {
    await this.client.hdel(this.HASH_KEY, id.value);
  }

  private serialize(snap: SimulationSnapshot): SerializedSnapshot {
    return {
      ...snap,
      startedAt: snap.startedAt.toISOString(),
      finishedAt: snap.finishedAt ? snap.finishedAt.toISOString() : null,
    };
  }

  private deserialize(raw: SerializedSnapshot): Simulation {
    const snap: SimulationSnapshot = {
      ...raw,
      startedAt: new Date(raw.startedAt),
      finishedAt: raw.finishedAt ? new Date(raw.finishedAt) : null,
    };
    return SimulationClass.fromSnapshot(snap, this.matches);
  }
}

interface SerializedSnapshot extends Omit<SimulationSnapshot, 'startedAt' | 'finishedAt'> {
  readonly startedAt: string;
  readonly finishedAt: string | null;
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- redis-simulation.repository.spec
```
Expected: 5 tests PASS (will take ~5-10s for Testcontainers to pull + start Redis).

```bash
npm run lint && npx tsc --noEmit
git add src/simulation/infrastructure/persistence/redis-simulation.repository.ts test/integration/distributed/redis-simulation.repository.spec.ts
git commit -m "feat(infra): RedisSimulationRepository (JSON in HSET)

- Implements SimulationRepository via ioredis HSET (key 'simulations', field = id)
- Serializes SimulationSnapshot with ISO-string dates
- Deserializes via Simulation.fromSnapshot(snap, matches) from Phase 2 Task 2
- findByOwner filters in memory (MVP scale; Phase 4 uses Postgres indexes)
- 5 Testcontainers-based integration tests covering full CRUD"
```

---

## Task 6: BullMQCommandBus adapter

**Files:**
- Create: `src/shared/messaging/bullmq-command-bus.ts`
- Create: `test/integration/distributed/bullmq-command-bus.spec.ts`

- [ ] **Step 1: Failing integration test**

`test/integration/distributed/bullmq-command-bus.spec.ts`:
```typescript
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { BullMQCommandBus } from '@shared/messaging/bullmq-command-bus';
import type { Command } from '@shared/messaging/command-bus.port';

jest.setTimeout(60_000);

interface TestCmd extends Command {
  type: 'test';
  payload: string;
}

describe('BullMQCommandBus (Testcontainers)', () => {
  let container: StartedTestContainer;
  let redisUrl: string;
  let bus: BullMQCommandBus;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    redisUrl = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  });

  afterAll(async () => {
    await container.stop();
  });

  beforeEach(() => {
    bus = new BullMQCommandBus(redisUrl);
  });

  afterEach(async () => {
    await bus.shutdown();
  });

  it('dispatched command arrives at subscribed handler', async () => {
    const received: TestCmd[] = [];
    bus.subscribe<TestCmd>('topic.A', async (cmd) => {
      received.push(cmd);
    });
    await bus.dispatch<TestCmd>('topic.A', { type: 'test', payload: 'hello' });

    // Wait for BullMQ consumer loop to process
    await waitFor(() => received.length === 1, 5000);
    expect(received[0].payload).toBe('hello');
  });

  it('different topics route to different handlers', async () => {
    const a: TestCmd[] = [];
    const b: TestCmd[] = [];
    bus.subscribe<TestCmd>('topic.A', async (c) => { a.push(c); });
    bus.subscribe<TestCmd>('topic.B', async (c) => { b.push(c); });
    await bus.dispatch<TestCmd>('topic.A', { type: 'test', payload: 'x' });
    await bus.dispatch<TestCmd>('topic.B', { type: 'test', payload: 'y' });
    await waitFor(() => a.length === 1 && b.length === 1, 5000);
    expect(a[0].payload).toBe('x');
    expect(b[0].payload).toBe('y');
  });

  it('unsubscribe stops delivery', async () => {
    const received: TestCmd[] = [];
    const sub = bus.subscribe<TestCmd>('topic.unsub', async (c) => { received.push(c); });
    await sub.unsubscribe();
    await bus.dispatch<TestCmd>('topic.unsub', { type: 'test', payload: 'nope' });
    await new Promise((r) => setTimeout(r, 500));
    expect(received).toEqual([]);
  });
});

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}
```

- [ ] **Step 2: Implement**

`src/shared/messaging/bullmq-command-bus.ts`:
```typescript
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
 * - Each topic → separate Queue + Worker (BullMQ Worker consumes jobs).
 * - dispatch() enqueues; subscribe() starts a Worker with the handler.
 * - shutdown() closes all queues + workers.
 */
export class BullMQCommandBus implements CommandBus {
  private readonly connection: RedisConnectionOptions;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Map<string, Worker>();
  private readonly workersByTopic = new Map<string, Set<Worker>>();

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
    this.trackWorker(topic, worker);
    return {
      unsubscribe: async () => {
        await worker.close();
        this.untrackWorker(topic, worker);
      },
    };
  }

  async shutdown(): Promise<void> {
    const workers = Array.from(this.workers.values());
    await Promise.all(workers.map((w) => w.close()));
    const queues = Array.from(this.queues.values());
    await Promise.all(queues.map((q) => q.close()));
    this.queues.clear();
    this.workers.clear();
    this.workersByTopic.clear();
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

  private trackWorker(topic: string, worker: Worker): void {
    this.workers.set(`${topic}:${Date.now()}:${Math.random()}`, worker);
    let set = this.workersByTopic.get(topic);
    if (!set) {
      set = new Set();
      this.workersByTopic.set(topic, set);
    }
    set.add(worker);
  }

  private untrackWorker(topic: string, worker: Worker): void {
    for (const [key, w] of this.workers.entries()) {
      if (w === worker) {
        this.workers.delete(key);
        break;
      }
    }
    this.workersByTopic.get(topic)?.delete(worker);
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- bullmq-command-bus.spec
npm run lint && npx tsc --noEmit
git add src/shared/messaging/bullmq-command-bus.ts test/integration/distributed/bullmq-command-bus.spec.ts
git commit -m "feat(infra): BullMQCommandBus — CommandBus adapter over BullMQ queues

- Per-topic Queue + Worker (BullMQ)
- dispatch → queue.add; subscribe → Worker with handler
- shutdown() gracefully closes all workers + queues
- removeOnComplete: 100 keeps last 100 for Bull Board inspection
- 3 Testcontainers tests: basic dispatch, topic routing, unsubscribe"
```

---

## Task 7: BullMQEventBus adapter

**Files:**
- Create: `src/shared/messaging/bullmq-event-bus.ts`
- Create: `test/integration/distributed/bullmq-event-bus.spec.ts`

- [ ] **Step 1: Failing integration test**

`test/integration/distributed/bullmq-event-bus.spec.ts`:
```typescript
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { BullMQEventBus } from '@shared/messaging/bullmq-event-bus';
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import { SimulationStarted } from '@simulation/domain/events/simulation-started';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';

jest.setTimeout(60_000);

describe('BullMQEventBus (Testcontainers)', () => {
  let container: StartedTestContainer;
  let redisUrl: string;
  let bus: BullMQEventBus;
  const simId = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    redisUrl = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  });

  afterAll(async () => {
    await container.stop();
  });

  beforeEach(() => {
    bus = new BullMQEventBus(redisUrl);
  });

  afterEach(async () => {
    await bus.shutdown();
  });

  it('subscriber receives published event', async () => {
    const received: DomainEvent[] = [];
    bus.subscribe(
      () => true,
      async (event) => {
        received.push(event);
      },
    );
    await bus.publish(new SimulationStarted(simId, new Date()), { simulationId: simId.value });
    await waitFor(() => received.length === 1, 5000);
    expect(received[0].type).toBe('SimulationStarted');
  });

  it('filter skips events', async () => {
    const received: DomainEvent[] = [];
    bus.subscribe(
      () => false,
      async (event) => {
        received.push(event);
      },
    );
    await bus.publish(new SimulationStarted(simId, new Date()), { simulationId: simId.value });
    await new Promise((r) => setTimeout(r, 500));
    expect(received).toEqual([]);
  });
});

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}
```

- [ ] **Step 2: Implement**

`src/shared/messaging/bullmq-event-bus.ts`:
```typescript
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
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- bullmq-event-bus.spec
npm run lint && npx tsc --noEmit
git add src/shared/messaging/bullmq-event-bus.ts test/integration/distributed/bullmq-event-bus.spec.ts
git commit -m "feat(infra): BullMQEventBus — EventBus adapter over single BullMQ queue

- Single queue 'simulation.events'; subscribe creates Worker with filter+handler
- Phase 2 single-orchestrator: queue semantics OK. Phase 3+ may swap to pub/sub
- 2 Testcontainers tests covering publish-receive + filter"
```

---

## Task 8: Conditional adapter selection in SimulationModule (env-based)

**Files:**
- Modify: `src/simulation/simulation.module.ts`

The module must select InMemory vs BullMQ/Redis adapters based on env vars. Use `useFactory` that reads `ConfigService`.

- [ ] **Step 1: Modify SimulationModule — adapter selection**

Replace the `PORT_TOKENS.COMMAND_BUS` provider with:
```typescript
    {
      provide: PORT_TOKENS.COMMAND_BUS,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const mode = config.get('TRANSPORT_MODE', { infer: true });
        if (mode === 'bullmq') {
          const { BullMQCommandBus } = await import('@shared/messaging/bullmq-command-bus');
          return new BullMQCommandBus(config.get('REDIS_URL', { infer: true }));
        }
        const { InMemoryCommandBus } = await import('@shared/messaging/in-memory-command-bus');
        return new InMemoryCommandBus();
      },
      inject: [ConfigService],
    },
```

Replace `PORT_TOKENS.EVENT_BUS` similarly:
```typescript
    {
      provide: PORT_TOKENS.EVENT_BUS,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const mode = config.get('TRANSPORT_MODE', { infer: true });
        if (mode === 'bullmq') {
          const { BullMQEventBus } = await import('@shared/messaging/bullmq-event-bus');
          return new BullMQEventBus(config.get('REDIS_URL', { infer: true }));
        }
        const { InMemoryEventBus } = await import('@shared/messaging/in-memory-event-bus');
        return new InMemoryEventBus();
      },
      inject: [ConfigService],
    },
```

Replace `PORT_TOKENS.SIMULATION_REPOSITORY`:
```typescript
    {
      provide: PORT_TOKENS.SIMULATION_REPOSITORY,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const mode = config.get('PERSISTENCE_MODE', { infer: true });
        if (mode === 'redis') {
          const { createRedisClient } = await import('@shared/infrastructure/redis.client');
          const { RedisSimulationRepository } = await import('@simulation/infrastructure/persistence/redis-simulation.repository');
          const { PRESET_MATCHES } = await import('@simulation/domain/value-objects/matches-preset');
          const client = createRedisClient(config.get('REDIS_URL', { infer: true }));
          await client.connect();
          return new RedisSimulationRepository(client, PRESET_MATCHES);
        }
        const { InMemorySimulationRepository } = await import('@simulation/infrastructure/persistence/in-memory-simulation.repository');
        return new InMemorySimulationRepository();
      },
      inject: [ConfigService],
    },
```

- [ ] **Step 2: Update onModuleDestroy to close bus + repo**

In `SimulationModule` class, add bus shutdown and close Redis client if used. If the provider returns a BullMQ bus, we need to call `.shutdown()` on destroy. Simplest approach: inject the tokens into module and call shutdown on them if they have the method.

Modify `SimulationModule` class:
```typescript
export class SimulationModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly worker: SimulationWorkerHandler,
    private readonly forwarder: WsEventForwarder,
    @Inject(PORT_TOKENS.COMMAND_BUS) private readonly commandBus: CommandBus,
    @Inject(PORT_TOKENS.EVENT_BUS) private readonly eventBus: EventBus,
  ) {}

  onModuleInit(): void {
    this.worker.subscribe();
    this.forwarder.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.shutdown();
    await this.forwarder.stop();
    if ('shutdown' in this.commandBus && typeof (this.commandBus as { shutdown?: unknown }).shutdown === 'function') {
      await (this.commandBus as { shutdown: () => Promise<void> }).shutdown();
    }
    if ('shutdown' in this.eventBus && typeof (this.eventBus as { shutdown?: unknown }).shutdown === 'function') {
      await (this.eventBus as { shutdown: () => Promise<void> }).shutdown();
    }
  }
}
```

Add `@Inject` and `Inject` to imports, and import `CommandBus`/`EventBus` types.

- [ ] **Step 3: Verify — InMemory mode tests still pass**

```bash
npm test
```
Expected: all 185+ tests still green (TRANSPORT_MODE defaults to inmemory).

- [ ] **Step 4: Commit**

```bash
npm run lint && npx tsc --noEmit
git add src/simulation/simulation.module.ts
git commit -m "feat(nest): SimulationModule env-based adapter selection

- TRANSPORT_MODE=inmemory|bullmq selects CommandBus + EventBus impls
- PERSISTENCE_MODE=inmemory|redis selects SimulationRepository impl
- Dynamic imports avoid loading BullMQ/ioredis when not needed
- onModuleDestroy calls .shutdown() on buses if method exists (BullMQ cleanup)
- Defaults = inmemory (backward compat with Phase 1)"
```

---

## Task 9: Worker module (minimal NestJS module for worker process)

**Files:**
- Create: `src/worker/worker.module.ts`

The worker process needs: engine + dynamics + clock + random + worker handler + SimulationRepository (Redis) + CommandBus + EventPublisher. NO orchestrator, NO controllers, NO gateway, NO WS adapter.

- [ ] **Step 1: Create WorkerModule**

`src/worker/worker.module.ts`:
```typescript
import { Module, type OnModuleInit, type OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '@shared/config/config.schema';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { SystemClock } from '@simulation/infrastructure/time/system-clock';
import { CryptoRandomProvider } from '@simulation/infrastructure/random/crypto-random-provider';
import { UniformRandomGoalDynamics } from '@simulation/infrastructure/dynamics/uniform-random-goal-dynamics';
import { TickingSimulationEngine } from '@simulation/infrastructure/engine/ticking-simulation-engine';
import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';
import type { SimulationConfig } from '@simulation/domain/simulation-config';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { Clock } from '@simulation/domain/ports/clock.port';
import type { MatchDynamics } from '@simulation/domain/ports/match-dynamics.port';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { EventPublisher } from '@simulation/domain/ports/event-publisher.port';
import type { SimulationEngine } from '@simulation/domain/ports/simulation-engine.port';
import type { CommandBus } from '@shared/messaging/command-bus.port';
import type { EventBus } from '@shared/messaging/event-bus.port';

const DEFAULT_PROFILE_ID = 'default';

function configFromEnv(config: ConfigService<AppConfig, true>): SimulationConfig {
  return {
    durationMs: config.get('SIMULATION_DURATION_MS', { infer: true }),
    goalIntervalMs: config.get('GOAL_INTERVAL_MS', { infer: true }),
    goalCount: config.get('GOAL_COUNT', { infer: true }),
    firstGoalOffsetMs: config.get('FIRST_GOAL_OFFSET_MS', { infer: true }),
    startCooldownMs: config.get('START_COOLDOWN_MS', { infer: true }),
  };
}

@Module({
  providers: [
    { provide: PORT_TOKENS.CLOCK, useClass: SystemClock },
    { provide: PORT_TOKENS.RANDOM_PROVIDER, useClass: CryptoRandomProvider },
    {
      provide: PORT_TOKENS.SIMULATION_REPOSITORY,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const { createRedisClient } = await import('@shared/infrastructure/redis.client');
        const { RedisSimulationRepository } = await import('@simulation/infrastructure/persistence/redis-simulation.repository');
        const { PRESET_MATCHES } = await import('@simulation/domain/value-objects/matches-preset');
        const client = createRedisClient(config.get('REDIS_URL', { infer: true }));
        await client.connect();
        return new RedisSimulationRepository(client, PRESET_MATCHES);
      },
      inject: [ConfigService],
    },
    {
      provide: PORT_TOKENS.COMMAND_BUS,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const { BullMQCommandBus } = await import('@shared/messaging/bullmq-command-bus');
        return new BullMQCommandBus(config.get('REDIS_URL', { infer: true }));
      },
      inject: [ConfigService],
    },
    {
      provide: PORT_TOKENS.EVENT_BUS,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const { BullMQEventBus } = await import('@shared/messaging/bullmq-event-bus');
        return new BullMQEventBus(config.get('REDIS_URL', { infer: true }));
      },
      inject: [ConfigService],
    },
    {
      provide: PORT_TOKENS.EVENT_PUBLISHER,
      useFactory: async (bus: EventBus) => {
        const { InMemoryEventPublisher } = await import('@shared/messaging/in-memory-event-publisher');
        return new InMemoryEventPublisher(bus);
      },
      inject: [PORT_TOKENS.EVENT_BUS],
    },
    {
      provide: PORT_TOKENS.MATCH_DYNAMICS,
      useFactory: (random: RandomProvider, config: ConfigService<AppConfig, true>) =>
        new UniformRandomGoalDynamics(random, configFromEnv(config)),
      inject: [PORT_TOKENS.RANDOM_PROVIDER, ConfigService],
    },
    {
      provide: PORT_TOKENS.SIMULATION_ENGINE,
      useFactory: (clock: Clock, dynamics: MatchDynamics) =>
        new TickingSimulationEngine(clock, dynamics),
      inject: [PORT_TOKENS.CLOCK, PORT_TOKENS.MATCH_DYNAMICS],
    },
    {
      provide: SimulationWorkerHandler,
      useFactory: (
        simRepo: SimulationRepository,
        cmdBus: CommandBus,
        publisher: EventPublisher,
        engine: SimulationEngine,
        clock: Clock,
      ) =>
        new SimulationWorkerHandler({
          simulationRepository: simRepo,
          commandBus: cmdBus,
          eventPublisher: publisher,
          engine,
          clock,
          profileId: DEFAULT_PROFILE_ID,
        }),
      inject: [
        PORT_TOKENS.SIMULATION_REPOSITORY,
        PORT_TOKENS.COMMAND_BUS,
        PORT_TOKENS.EVENT_PUBLISHER,
        PORT_TOKENS.SIMULATION_ENGINE,
        PORT_TOKENS.CLOCK,
      ],
    },
  ],
  exports: [SimulationWorkerHandler, PORT_TOKENS.COMMAND_BUS, PORT_TOKENS.EVENT_BUS],
})
export class WorkerModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly worker: SimulationWorkerHandler,
    @Inject(PORT_TOKENS.COMMAND_BUS) private readonly commandBus: CommandBus,
    @Inject(PORT_TOKENS.EVENT_BUS) private readonly eventBus: EventBus,
  ) {}

  onModuleInit(): void {
    this.worker.subscribe();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.shutdown();
    if ('shutdown' in this.commandBus && typeof (this.commandBus as { shutdown?: unknown }).shutdown === 'function') {
      await (this.commandBus as { shutdown: () => Promise<void> }).shutdown();
    }
    if ('shutdown' in this.eventBus && typeof (this.eventBus as { shutdown?: unknown }).shutdown === 'function') {
      await (this.eventBus as { shutdown: () => Promise<void> }).shutdown();
    }
  }
}
```

- [ ] **Step 2: Verify + commit**

```bash
npm run lint && npx tsc --noEmit
git add src/worker/worker.module.ts
git commit -m "feat(worker): WorkerModule — minimal NestJS module for worker process

- Providers: engine + dynamics + clock + random + Redis repo + BullMQ buses + worker handler
- No controllers, no gateway, no WS adapter, no orchestrator
- onModuleInit subscribes worker; onModuleDestroy drains + closes buses"
```

---

## Task 10: Worker entrypoint src/worker.main.ts

**Files:**
- Create: `src/worker.main.ts`

- [ ] **Step 1: Create entrypoint**

`src/worker.main.ts`:
```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { WorkerModule } from './worker/worker.module';
import { ConfigSchema } from './shared/config/config.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    {
      module: class RootModule {},
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: (env) => {
            const parsed = ConfigSchema.safeParse(env);
            if (!parsed.success) {
              throw new Error(`Invalid env: ${JSON.stringify(parsed.error.format())}`);
            }
            return parsed.data;
          },
        }),
        WorkerModule,
      ],
    } as unknown as Parameters<typeof NestFactory.createApplicationContext>[0],
  );
  app.enableShutdownHooks();
  // eslint-disable-next-line no-console
  console.log('Worker started');
}

void bootstrap();
```

**Alternative simpler form** — if the inline module trick is brittle, use a dedicated bootstrap module. Create `src/worker.bootstrap.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';
import { WorkerModule } from './worker/worker.module';

@Module({
  imports: [AppConfigModule, WorkerModule],
})
export class WorkerBootstrapModule {}
```

Then `src/worker.main.ts` becomes simply:
```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerBootstrapModule } from './worker.bootstrap.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerBootstrapModule);
  app.enableShutdownHooks();
  // eslint-disable-next-line no-console
  console.log('Worker started (APP_MODE=worker)');
}

void bootstrap();
```

Use the simpler form. Create both files.

- [ ] **Step 2: Create WorkerBootstrapModule**

`src/worker.bootstrap.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';
import { WorkerModule } from './worker/worker.module';

@Module({
  imports: [AppConfigModule, WorkerModule],
})
export class WorkerBootstrapModule {}
```

- [ ] **Step 3: Create simpler src/worker.main.ts**

`src/worker.main.ts`:
```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerBootstrapModule } from './worker.bootstrap.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerBootstrapModule);
  app.enableShutdownHooks();
  // eslint-disable-next-line no-console
  console.log('Worker started (APP_MODE=worker)');
}

void bootstrap();
```

- [ ] **Step 4: Verify build + commit**

```bash
npx nest build
npm run lint && npx tsc --noEmit
git add src/worker.main.ts src/worker.bootstrap.module.ts
git commit -m "feat(worker): worker.main.ts standalone entrypoint + bootstrap module

- NestFactory.createApplicationContext (no HTTP server, no WS)
- Loads AppConfigModule + WorkerModule
- enableShutdownHooks for graceful drain
- Build produces dist/worker.main.js — entrypoint for worker Docker service"
```

---

## Task 11: Bull Board UI mount in main.ts

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Modify main.ts**

Replace entire `src/main.ts` with:
```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module';
import type { AppConfig } from './shared/config/config.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ZodValidationPipe());
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableShutdownHooks();

  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const transportMode = config.get('TRANSPORT_MODE', { infer: true });
  const bullBoardEnabled = config.get('BULL_BOARD_ENABLED', { infer: true });

  if (transportMode === 'bullmq' && bullBoardEnabled) {
    await mountBullBoard(app);
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  // TODO(phase-6): replace with Pino logger.
  // eslint-disable-next-line no-console
  console.log(`Application is running on port ${port} (mode: ${transportMode})`);
}

async function mountBullBoard(app: Awaited<ReturnType<typeof NestFactory.create>>): Promise<void> {
  const { createBullBoard } = await import('@bull-board/api');
  const { BullMQAdapter } = await import('@bull-board/api/bullMQAdapter');
  const { ExpressAdapter } = await import('@bull-board/express');
  const { PORT_TOKENS } = await import('./simulation/domain/ports/tokens');
  const { BullMQCommandBus } = await import('./shared/messaging/bullmq-command-bus');
  const { BullMQEventBus } = await import('./shared/messaging/bullmq-event-bus');

  const commandBus = app.get(PORT_TOKENS.COMMAND_BUS);
  const eventBus = app.get(PORT_TOKENS.EVENT_BUS);
  const adapters: ReturnType<typeof BullMQAdapter.prototype.constructor>[] = [];

  if (commandBus instanceof BullMQCommandBus) {
    for (const [, queue] of commandBus.getQueues()) {
      adapters.push(new BullMQAdapter(queue) as never);
    }
  }
  if (eventBus instanceof BullMQEventBus) {
    adapters.push(new BullMQAdapter(eventBus.getQueue()) as never);
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/queues');
  createBullBoard({ queues: adapters as never, serverAdapter });

  const httpAdapter = app.getHttpAdapter();
  httpAdapter.use('/queues', serverAdapter.getRouter());
}

void bootstrap();
```

**Note**: Bull Board adapter types are a bit awkward. The `as never` casts are pragmatic; alternatively use looser type. If TS complains, add `eslint-disable-next-line @typescript-eslint/no-explicit-any` and use `any`.

- [ ] **Step 2: Build + verify**

```bash
npx nest build
npm run lint && npx tsc --noEmit && npm test
```
All gates should still pass. Bull Board only activates when `TRANSPORT_MODE=bullmq`.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat(ops): mount Bull Board UI at /queues when TRANSPORT_MODE=bullmq

- Discovers all queues registered by BullMQCommandBus + BullMQEventBus
- BULL_BOARD_ENABLED env flag (default true) allows disabling in prod
- Silent no-op when TRANSPORT_MODE=inmemory (backward compat)"
```

---

## Task 12: Dockerfile — support APP_MODE for orchestrator/worker

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Modify runner stage to use APP_MODE-aware entrypoint**

Replace final CMD in `Dockerfile`:
```dockerfile
# ---------- Stage 3: Runner ----------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV APP_MODE=orchestrator

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --chown=app:app --from=deps /app/node_modules ./node_modules
COPY --chown=app:app --from=builder /app/dist ./dist
COPY --chown=app:app package.json ./

USER app

EXPOSE 3000

# APP_MODE env selects which entrypoint to run:
# - orchestrator (default): dist/main.js — HTTP + WS + Bull Board
# - worker: dist/worker.main.js — BullMQ consumer only
CMD ["sh", "-c", "if [ \"$APP_MODE\" = \"worker\" ]; then node dist/worker.main.js; else node dist/main.js; fi"]
```

- [ ] **Step 2: Build + smoke test**

```bash
docker build -t sportradar-simulation:phase-2 -q . 
docker run --rm -d --name smoke-orch -p 3000:3000 -e NODE_ENV=development sportradar-simulation:phase-2
sleep 3
docker logs smoke-orch | grep "Application is running" && echo "ORCHESTRATOR OK"
docker stop smoke-orch
docker run --rm -d --name smoke-worker -e APP_MODE=worker -e TRANSPORT_MODE=inmemory sportradar-simulation:phase-2 || echo "WORKER fails without Redis (expected — requires compose setup)"
docker stop smoke-worker 2>/dev/null || true
```
Worker standalone won't succeed without Redis — that's fine, we'll verify via compose in Task 13.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "chore(docker): support APP_MODE for orchestrator/worker entrypoints

- APP_MODE=orchestrator (default) runs dist/main.js
- APP_MODE=worker runs dist/worker.main.js (BullMQ consumer only)
- Same image, different entrypoint via env — consistent with 12-factor pattern"
```

---

## Task 13: docker-compose.yml — Redis + orchestrator + worker

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Replace docker-compose.yml**

```yaml
# Phase 2 — distributed mode with Redis + worker replicas.
# Phase 4 will add: postgres.

services:
  redis:
    image: redis:7-alpine
    container_name: sportradar-redis
    ports:
      - '6379:6379'
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 5

  orchestrator:
    build:
      context: .
      dockerfile: Dockerfile
    image: sportradar-simulation:local
    container_name: sportradar-orchestrator
    depends_on:
      redis:
        condition: service_healthy
    ports:
      - '3000:3000'
    environment:
      # Only override values that differ from Zod defaults in src/shared/config/config.schema.ts.
      NODE_ENV: development
      APP_MODE: orchestrator
      TRANSPORT_MODE: bullmq
      PERSISTENCE_MODE: redis
      REDIS_URL: redis://redis:6379
      BULL_BOARD_ENABLED: 'true'
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: Dockerfile
    image: sportradar-simulation:local
    depends_on:
      redis:
        condition: service_healthy
      orchestrator:
        condition: service_started
    environment:
      NODE_ENV: development
      APP_MODE: worker
      TRANSPORT_MODE: bullmq
      PERSISTENCE_MODE: redis
      REDIS_URL: redis://redis:6379
    deploy:
      replicas: 2
    restart: unless-stopped
```

- [ ] **Step 2: Verify compose up**

```bash
docker compose down --remove-orphans 2>/dev/null || true
docker compose up -d --build
sleep 5
docker compose ps
docker compose logs orchestrator | tail -5
docker compose logs worker | tail -10
# Smoke test
curl -sf -X POST http://localhost:3000/simulations -H "Content-Type: application/json" -d '{"name":"Distributed Test"}' | head -c 200
echo ""
# Wait for simulation to finish (~10s auto-finish)
sleep 12
curl -sf http://localhost:3000/simulations | head -c 500
echo ""
# Bull Board
curl -sf -o /dev/null -w '%{http_code}' http://localhost:3000/queues
echo ""
docker compose down
```

Expected:
- orchestrator logs: "Application is running on port 3000 (mode: bullmq)"
- worker logs: "Worker started (APP_MODE=worker)"
- POST returns 201 with simulationId + ownershipToken
- After 12s, GET returns simulation with state FINISHED + totalGoals=9
- Bull Board at /queues returns 200

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(docker): docker-compose with redis + orchestrator + 2x worker replicas

- redis: redis:7-alpine with healthcheck
- orchestrator: APP_MODE=orchestrator, TRANSPORT_MODE=bullmq, PERSISTENCE_MODE=redis
- worker (2 replicas): APP_MODE=worker, depends on healthy redis + started orchestrator
- Ready to scale with 'docker compose up -d --scale worker=N'"
```

---

## Task 14: Distributed E2E — HTTP flow over BullMQ + Redis

**Files:**
- Create: `test/integration/distributed/http-distributed.e2e-spec.ts`

This test spins up Redis via Testcontainers, starts the full NestJS app in bullmq/redis mode (single-process for test simplicity — simulates orchestrator), and verifies the full flow.

- [ ] **Step 1: Write test**

`test/integration/distributed/http-distributed.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { AppModule } from '../../../src/app.module';
import { ConfigService } from '@nestjs/config';

jest.setTimeout(120_000);

describe('Distributed HTTP flow (BullMQ + Redis via Testcontainers)', () => {
  let container: StartedTestContainer;
  let app: INestApplication;

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const redisUrl = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
    process.env.TRANSPORT_MODE = 'bullmq';
    process.env.PERSISTENCE_MODE = 'redis';
    process.env.REDIS_URL = redisUrl;
    process.env.BULL_BOARD_ENABLED = 'false'; // avoid mounting UI in tests

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await container.stop();
    delete process.env.TRANSPORT_MODE;
    delete process.env.PERSISTENCE_MODE;
    delete process.env.REDIS_URL;
    delete process.env.BULL_BOARD_ENABLED;
  });

  it('full flow over BullMQ: POST → 9 goals → auto-finish (real engine timing)', async () => {
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .send({ name: 'Distributed MVP' })
      .expect(201);
    const simId = created.body.simulationId;

    // Real-time timing — wait ~11s for 9 goals + finish event to propagate
    await new Promise((resolve) => setTimeout(resolve, 11_000));

    const final = await request(app.getHttpServer())
      .get(`/simulations/${simId}`)
      .expect(200);
    expect(final.body.state).toBe('FINISHED');
    expect(final.body.totalGoals).toBe(9);
  });
});
```

**Note**: This test uses REAL timing (wall clock 11s) because FakeClock is not injectable through BullMQ boundaries. Worker would need its own FakeClock, orchestrator its own — and keeping them in sync via BullMQ is complex. Real-clock test is the pragmatic choice.

- [ ] **Step 2: Run + commit**

```bash
npm test -- http-distributed.e2e-spec
```
Expected: 1 test PASS in ~15-20s (Redis startup + 11s real timing).

```bash
npm run lint && npx tsc --noEmit
git add test/integration/distributed/http-distributed.e2e-spec.ts
git commit -m "test(integration/distributed): full HTTP flow over BullMQ + Redis (Testcontainers)

- Spins up real Redis via Testcontainers
- AppModule runs in bullmq + redis mode
- Real wall-clock 11s timing (FakeClock not injectable across BullMQ boundaries)
- Verifies POST → 9 goals → auto-finish FINISHED state"
```

---

## Task 15: README update — Phase 2 architecture + run instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update status line and add Phase 2 section**

Modify `README.md` — change status:
```markdown
**Status**: Phase 2 distributed (tag `v2.0-bullmq-distributed`). BullMQ + Redis transport, workers as separate processes.
```

After the Quick start section, add:
```markdown
### Distributed mode (Phase 2+)

Full stack via docker-compose (orchestrator + N workers + Redis):

```bash
docker compose up --build
# http://localhost:3000 — orchestrator (REST + WS)
# http://localhost:3000/queues — Bull Board UI
```

Scale workers:
```bash
docker compose up -d --scale worker=4 --build
```

Switch to single-process (Phase 1 mode) via env:
```bash
TRANSPORT_MODE=inmemory PERSISTENCE_MODE=inmemory npm run start:dev
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README Phase 2 status + distributed run instructions + Bull Board URL"
```

---

## Task 16: CHANGELOG + tag v2.0-bullmq-distributed + push

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add Phase 2 CHANGELOG entry**

Modify `CHANGELOG.md` — insert under `## [Unreleased]`:

```markdown
## [2.0.0] — 2026-04-18

### Phase 2 — BullMQ distributed workers
- `bullmq` + `ioredis` + `@nestjs/bullmq` + Bull Board UI + `testcontainers` installed
- Shared Redis client factory (`createRedisClient`): lazy connection, BullMQ-compatible
- `Simulation.fromSnapshot` + `ScoreBoard.fromSnapshot` static methods for aggregate reconstruction
- `RedisSimulationRepository`: HSET-backed persistence, JSON snapshot serialization, deserializes via `fromSnapshot`
- `BullMQCommandBus`: per-topic Queue + Worker, shutdown cleanup, Bull Board visible
- `BullMQEventBus`: single `simulation.events` queue, filter-based subscribe
- Env-based adapter selection: `TRANSPORT_MODE=inmemory|bullmq`, `PERSISTENCE_MODE=inmemory|redis`, `APP_MODE=orchestrator|worker`
- `WorkerModule`: minimal NestJS module for worker process (engine + dynamics + handler + BullMQ + Redis repo only)
- `src/worker.main.ts` + `WorkerBootstrapModule`: standalone worker entrypoint
- `main.ts`: Bull Board UI mounted at `/queues` when `TRANSPORT_MODE=bullmq`
- `Dockerfile`: APP_MODE-aware CMD (same image, different entrypoint)
- `docker-compose.yml`: `redis` + `orchestrator` + `worker` (2 replicas) services with healthchecks
- Integration tests with Testcontainers:
  - `RedisSimulationRepository` CRUD (5 tests)
  - `BullMQCommandBus` routing (3 tests)
  - `BullMQEventBus` publish/subscribe (2 tests)
  - Full distributed HTTP flow (1 test, real 11s timing)
- README: Phase 2 distributed run instructions + Bull Board URL

### Key design decisions
- Unified BullMQ transport (both CommandBus + EventBus) — single Redis, single lib, Bull Board shows everything. Phase 3+ may introduce Redis pub/sub for EventBus when multi-orchestrator.
- `OwnershipRepository` stays InMemory (orchestrator-only concern in Phase 2)
- Aggregate reconstruction uses `PRESET_MATCHES` constant (Phase 3 profile-driven dynamics will pass profile-specific matches)

### Tagged
- `v2.0-bullmq-distributed`
```

- [ ] **Step 2: Commit CHANGELOG + tag**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG [2.0.0] — Phase 2 BullMQ distributed complete"

# Full gate run before tag
npm run format:check && npm run lint && npx tsc --noEmit && npm test && npm run build

# Create annotated tag
git tag -a v2.0-bullmq-distributed -m "Phase 2 — BullMQ distributed workers complete

Distributed architecture: orchestrator + N workers + Redis (via docker-compose).
- Same Docker image, APP_MODE env selects entrypoint
- BullMQ for both CommandBus + EventBus (unified transport)
- Redis-backed SimulationRepository (shared between orchestrator and workers)
- Bull Board UI at /queues for queue inspection demo
- InMemory adapters preserved for unit tests (<10s full suite)
- Testcontainers-based integration tests for real Redis verification

Phase 3 will swap EventBus to Redis pub/sub when multi-orchestrator horizontal
scale is introduced. Phase 4 replaces Redis persistence with PostgreSQL."

# Push branch + tag (user will run this)
# git push origin phase-2-bullmq-distributed
# git push origin v2.0-bullmq-distributed
```

---

## Task 17: Post-implementation simplify + security review

- [ ] **Step 1: Simplify review**

Invoke simplify skill targeting Phase 2 changes (diff main..HEAD since `v1.0-mvp-in-process`).

If findings: apply fixes inline, commit as `refactor: simplify review — <description>`, re-tag v2.0 (delete local, recreate).

- [ ] **Step 2: Security review**

Dispatch `feature-dev:code-reviewer` with security focus:
- Redis auth (no password in compose — document as dev-only limitation)
- `cors: true` on WS — still permissive
- Event payload serialization — any risk of injection in JSON fields?
- Container permissions (non-root already ✓ from Phase 0)
- `npm audit --audit-level=high` for new deps (bullmq, ioredis, bull-board, testcontainers)

Document findings in ADR-002 if significant, commit as `fix(security): <descriptions>`.

- [ ] **Step 3: Re-push if re-tagged**

```bash
# Only if code changed post-tag
git push origin phase-2-bullmq-distributed
# Re-tag (destructive on remote — use --force-with-lease equivalent by deleting + pushing)
git push origin --delete v2.0-bullmq-distributed
git push origin v2.0-bullmq-distributed
```

---

## Phase 2 — Task summary

| # | Task | Deliverable |
|---|---|---|
| 1 | Install deps (BullMQ + ioredis + Bull Board + Testcontainers) | package.json + lock |
| 2 | Simulation.fromSnapshot + ScoreBoard.fromSnapshot | 5 new unit tests |
| 3 | Config schema env vars | REDIS_URL, TRANSPORT_MODE, etc. |
| 4 | Redis client factory | `createRedisClient` |
| 5 | RedisSimulationRepository | 5 Testcontainers tests |
| 6 | BullMQCommandBus | 3 Testcontainers tests |
| 7 | BullMQEventBus | 2 Testcontainers tests |
| 8 | Adapter selection in SimulationModule | Env-based switching |
| 9 | WorkerModule | Minimal NestJS module |
| 10 | Worker entrypoint | `src/worker.main.ts` + bootstrap module |
| 11 | Bull Board mount in main.ts | `/queues` UI |
| 12 | Dockerfile APP_MODE | Unified image, entrypoint switch |
| 13 | docker-compose (redis + orchestrator + 2x worker) | Manual smoke test |
| 14 | Distributed HTTP E2E | Testcontainers + real timing |
| 15 | README Phase 2 section | Distributed run instructions |
| 16 | CHANGELOG + tag v2.0-bullmq-distributed + push | Release milestone |
| 17 | Simplify + security review | Optional ADRs |

**Expected test count after Phase 2:** ~195 existing unit + ~11 Testcontainers integration = ~206 tests. Unit tests <10s. Testcontainers tests add ~30s (once Redis image cached).

**Tag `v2.0-bullmq-distributed`** is the milestone — distributed architecture with workers, ready for Phase 3 (profile-driven specialization).
