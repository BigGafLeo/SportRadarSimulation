# Phase 3 — Profile-Driven Specialization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wprowadzić **3 profile uruchomieniowe** (`uniform-realtime`, `poisson-accelerated`, `fast-markov`), każdy z własną kombinacją `(MatchDynamics, Clock, config)`. Worker przy starcie czyta `SIMULATION_PROFILE` env i montuje odpowiednie binding'i DI — **jeden kod, jeden image, N replik per profile**. API: `POST /simulations { profile? }` z whitelist walidacją. Orchestrator dispatchuje do `simulation.run.{profileId}`. docker-compose: 3 osobne `worker-*` services.

**Architecture:** Profile registry (`PROFILES` const map) jest źródłem prawdy dla obu stron — orchestrator importuje listę ID dla Zod enum, worker importuje wybrany profile dla DI override. Każda dynamics ma własny config interface (uniform-specific pola wyciągnięte z `SimulationConfig`). `AcceleratedClock(factor)` wraps base clock i dzieli `sleep(ms)` przez factor — engine nie wie, że biegnie szybciej. Dynamics są stateful (per-simulationId Map) bo Poisson/Markov potrzebują pamiętać stan między krokami; cleanup na końcu run lub przy nowym tick=0.

**Tech Stack:** istniejący (NestJS 10, TypeScript strict, Zod, BullMQ, ioredis, Jest, Testcontainers). Bez nowych zależności.

**Spec reference:** `docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md` §3.6, §6, §7.6, §9 Phase 3.

**Phase 2 state (input):** tag `v2.0-bullmq-distributed`, 187 tests passing, distributed mode działający, dashboard na `feature/dashboard-realtime` (poza scope tej fazy).

**Phase 3 delivery state (expected):**
- ~210+ total tests (187 carried + ~25 new dla dynamics/clock/profiles/routing)
- `v3.0-profile-driven` git tag
- `docker compose up` startuje: redis + orchestrator + worker-uniform (×2) + worker-poisson (×1) + worker-markov (×1)
- `POST /simulations { name, profile: "poisson-accelerated" }` daje realistyczny rozkład bramek
- `POST /simulations { name }` (bez profile) → default `uniform-realtime` (zero breaking change)
- Post-impl: simplify + security review

---

## Key Design Decisions

### D1. Trzy dynamics: Uniform (existing) + Poisson + FastMarkov

- **Uniform**: zachowane bez zmian funkcjonalnych. Refactor: używa nowego `UniformDynamicsConfig`.
- **Poisson**: per-team niezależny proces Poissona, sample inter-arrival z rozkładu wykładniczego. Parametr `goalsPerTeamMean` (default 2.7 dla 90-min meczu). Stateful per simulation.
- **FastMarkov**: deterministyczna macierz przejść stanów meczu. Goal emitowany gdy stan = `GOAL_HOME`/`GOAL_AWAY`. Stateful per simulation. Step duration konfigurowane.
- **RichEvent**: ODROCZONE do Phase 5 (gdy będą rich events na poziomie domain).

### D2. Profile model: `Profile { id, coreConfig, dynamicsFactory, clockFactory }`

- `Profile` to value object (interface + const map)
- `dynamicsFactory(deps): MatchDynamics` — pozwala dynamics wstrzykiwać `RandomProvider` w czasie tworzenia
- `clockFactory(): Clock` — zwraca świeży zegar (np. `new AcceleratedClock(new SystemClock(), 600)`)
- Rejestr `PROFILES` w `src/simulation/infrastructure/profiles/profile-registry.ts`

### D3. SimulationConfig split

Aktualny `SimulationConfig` miksuje pola domenowe i uniform-specific. Po split:
- **`CoreSimulationConfig`** = `{ durationMs }` — advisory metadata, używana przez Poisson dla λ i Markov dla max steps
- **`UniformDynamicsConfig`** = `{ goalCount, goalIntervalMs, firstGoalOffsetMs }`
- **`PoissonDynamicsConfig`** = `{ goalsPerTeamMean }`
- **`MarkovDynamicsConfig`** = `{ stepMs }` (transition matrix hard-coded w klasie)
- `startCooldownMs`, `finishedRetentionMs` przestają być w "config" — już są pobierane env-direct przez policies (zero refactor poza usunięciem martwych pól)
- `SimulationOrchestrator` przestaje wymagać `config: SimulationConfig` — zamiast tego `cooldownMs: number` jako primitive dep (lub via `throttlePolicy.getCooldownMs()`)

### D4. RandomProvider extension

Dodajemy `float(): number` (zwraca [0, 1)) do portu `RandomProvider`. Potrzebne dla samplowania Poisson + Markov. Update obu impl (`CryptoRandomProvider`, `SeededRandomProvider`).

### D5. AcceleratedClock semantics

- `new AcceleratedClock(baseClock, factor)` — wraps istniejący zegar
- `now()` → real time (dla event timestamps — audytowalność)
- `sleep(ms)` → `baseClock.sleep(ms / factor)` — engine biegnie `factor×` szybciej w wall-clock
- Zero zmian w engine

### D6. Per-profile topic routing

- `simulation.run.{profileId}` — różne topiki per profile
- `simulation.abort` — wspólny (orchestrator wie tylko o jednym sim, niezależnie od profile)
- `simulation.events` — wspólny
- Worker w `WorkerModule` subskrybuje **tylko jeden** `simulation.run.{profile}` topic (z env)
- `SIMULATION_TOPICS.RUN(profileId)` istnieje już w kodzie — wykorzystujemy

### D7. API: profile w body POST /simulations

```json
POST /simulations
{ "name": "Katar 2023", "profile": "poisson-accelerated" }
```
- `profile` opcjonalny, default `"uniform-realtime"`
- Zod whitelist: `z.enum([...PROFILE_IDS])` — odrzuca unknown z 400
- Bez breaking change dla istniejących klientów

### D8. Brak workera dla profilu (D8 z brainstormu) → lazy/pending

- Job ląduje w `simulation.run.{profile}` queue, czeka na worker
- Klient dostał 201 z `simulationId` ale nie zobaczy `simulation-started` na WS
- Dashboard pokaże `workerCount=0, waiting=N` per topic — ops widzi problem
- **Phase 6 (ops maturity)** dodaje proper readiness gate (503 przy braku workera) — patrz spec §9 Phase 6

### D9. docker-compose: 3 osobne `worker-*` services

```yaml
worker-uniform:   SIMULATION_PROFILE=uniform-realtime    deploy.replicas: 2
worker-poisson:   SIMULATION_PROFILE=poisson-accelerated deploy.replicas: 1
worker-markov:    SIMULATION_PROFILE=fast-markov         deploy.replicas: 1
```
- `docker compose ps` pokazuje 3 logiczne usługi
- `docker compose scale worker-poisson=5` — skala per profile
- 1:1 mapping na future k8s Deployments (Phase 6)

### D10. Dynamics state per-simulation

Poisson i Markov są stateful (między tickami). Każda dynamics trzyma `Map<simulationId, State>`:
- Init przy `tick === 0` (lub gdy brak entry) — engine zaczyna nowy run zawsze od tick=0
- Cleanup gdy `nextStep` zwraca `undefined` (engine kończy)
- Cleanup leak w razie aborted runów akceptowalny dla Phase 3 — Phase 5 (graceful shutdown) sprzątnie

---

## File Structure

### New files

```
docs/decisions/
├── 002-simulation-config-split.md
├── 003-profile-registry.md
├── 004-per-profile-topic-routing.md
└── 005-accelerated-clock-semantics.md

src/simulation/
├── domain/
│   ├── core-simulation-config.ts            (renamed from simulation-config.ts, slimmed)
│   └── ports/random-provider.port.ts        (modified: + float())
└── infrastructure/
    ├── dynamics/
    │   ├── poisson-goal-dynamics.ts
    │   └── fast-markov-dynamics.ts
    ├── time/
    │   └── accelerated-clock.ts
    └── profiles/
        ├── profile.ts                       (interface + types)
        ├── profile-registry.ts              (PROFILES map + PROFILE_IDS)
        ├── uniform-realtime.profile.ts
        ├── poisson-accelerated.profile.ts
        └── fast-markov.profile.ts

test/unit/infrastructure/
├── dynamics/
│   ├── poisson-goal-dynamics.spec.ts
│   └── fast-markov-dynamics.spec.ts
├── time/
│   └── accelerated-clock.spec.ts
└── profiles/
    └── profile-registry.spec.ts

test/integration/
└── distributed/
    └── per-profile-routing.spec.ts          (Testcontainers — verifies topic separation)

test/e2e/
└── profile-param.e2e-spec.ts                (POST { profile } → expect different goal pattern)
```

### Modified files

```
src/simulation/
├── domain/simulation-config.ts              (DELETED — split into core + per-dynamics)
├── infrastructure/dynamics/
│   └── uniform-random-goal-dynamics.ts      (uses UniformDynamicsConfig)
├── infrastructure/random/
│   ├── crypto-random-provider.ts            (+ float())
│   └── seeded-random-provider.ts            (+ float())
├── application/orchestrator/
│   └── simulation-orchestrator.ts           (drops config dep, takes cooldownMs primitive)
├── infrastructure/consumer/http/
│   ├── simulation.controller.ts             (passes profile to orchestrator)
│   └── dto/create-simulation.request.ts     (+ profile field with Zod whitelist)
└── simulation.module.ts                     (orchestrator wiring drops configFromEnv)

src/worker/
└── worker.module.ts                         (env-driven profile DI override)

src/shared/config/config.schema.ts           (+ SIMULATION_PROFILE)

docker-compose.yml                           (3 worker-* services)
README.md                                    (Phase 3 status + profile usage)
CHANGELOG.md                                 ([3.0.0] entry)
```

---

## Tasks

### Task 1: ADR-002 — SimulationConfig split

**Files:**
- Create: `docs/decisions/002-simulation-config-split.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR-002: SimulationConfig split into core + per-dynamics configs

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 3

## Context
Phase 1/2 `SimulationConfig` mixes domain timing (`durationMs`) with uniform-random-specific fields (`goalCount`, `goalIntervalMs`, `firstGoalOffsetMs`) and orchestrator policy params (`startCooldownMs`). Phase 3 adds Poisson and Markov dynamics, each with own config shape (`goalsPerTeamMean`, `stepMs` etc.). Single shared interface forces unrelated fields together and grows monotonically.

## Options considered
1. **Discriminated union per profile** — `type SimulationConfig = UniformConfig | PoissonConfig | MarkovConfig`. Pros: type-safe per profile. Cons: every consumer needs narrowing; orchestrator would have to know profile types.
2. **Nested per-dynamics config** — `SimulationConfig { core, uniform?, poisson?, markov? }`. Pros: single object. Cons: optional fields, runtime checks for "is the right one populated".
3. **Split into independent interfaces** (this ADR) — `CoreSimulationConfig` separate from `UniformDynamicsConfig` / `PoissonDynamicsConfig` / `MarkovDynamicsConfig`. Each dynamics holds its own config. Orchestrator takes `cooldownMs` as primitive (no config object).

## Decision
Option 3. Each `MatchDynamics` impl encapsulates its own config interface. `CoreSimulationConfig` holds only `durationMs` (advisory total match duration, used by Poisson for λ and Markov for max steps). Orchestrator drops `SimulationConfig` dep entirely — uses `cooldownMs: number` primitive injected from env.

## Consequences
- ✅ Each dynamics fully owns its config — adding new dynamics = adding new config interface, zero ripple
- ✅ Orchestrator decoupled from dynamics-specific timing (single responsibility)
- ✅ Profile registry holds `(coreConfig, dynamicsConfig)` per profile — composable
- ❌ `SimulationConfig` interface deleted — breaking change for any external consumer (none in this repo)
- 🔄 `simulation.module.ts` and `worker.module.ts` factories simplified (no more `configFromEnv` helper)

## References
- Phase 3 plan: `docs/superpowers/plans/2026-04-19-phase-3-profile-driven-specialization.md` Task 2
- Spec §6, §9 Phase 3
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/002-simulation-config-split.md
git commit -m "docs(adr): ADR-002 — SimulationConfig split into core + per-dynamics"
```

---

### Task 2: Refactor SimulationConfig — split + propagate

**Files:**
- Delete: `src/simulation/domain/simulation-config.ts`
- Create: `src/simulation/domain/core-simulation-config.ts`
- Modify: `src/simulation/infrastructure/dynamics/uniform-random-goal-dynamics.ts`
- Modify: `src/simulation/application/orchestrator/simulation-orchestrator.ts`
- Modify: `src/simulation/simulation.module.ts`
- Modify: `src/worker/worker.module.ts`
- Modify: `test/unit/application/orchestrator/simulation-orchestrator.spec.ts`
- Modify: `test/unit/application/worker/simulation-worker.handler.spec.ts`
- Modify: `test/unit/infrastructure/dynamics/uniform-random-goal-dynamics.spec.ts`
- Modify: `test/unit/infrastructure/engine/ticking-simulation-engine.spec.ts`
- Modify: `test/integration/simulation-engine-end-to-end.spec.ts`

- [ ] **Step 1: Create CoreSimulationConfig**

`src/simulation/domain/core-simulation-config.ts`:
```typescript
/**
 * Advisory match-wide timing metadata. Used by dynamics to bound their
 * own internal scheduling (Poisson λ rate, Markov max steps).
 */
export interface CoreSimulationConfig {
  readonly durationMs: number;
}
```

- [ ] **Step 2: Move uniform-specific fields into UniformRandomGoalDynamics**

Replace `src/simulation/infrastructure/dynamics/uniform-random-goal-dynamics.ts`:
```typescript
import type { MatchDynamics, TimedEvent } from '@simulation/domain/ports/match-dynamics.port';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { CoreSimulationConfig } from '@simulation/domain/core-simulation-config';
import { GoalScored } from '@simulation/domain/events/goal-scored';
import { PRESET_TEAMS } from '@simulation/domain/value-objects/matches-preset';

export interface UniformDynamicsConfig {
  readonly goalCount: number;
  readonly goalIntervalMs: number;
  readonly firstGoalOffsetMs: number;
}

/**
 * Produces "intent" GoalScored events at fixed intervals. Engine translates
 * each intent into sim.applyGoal(teamId, now). See ADR-001.
 */
export class UniformRandomGoalDynamics implements MatchDynamics {
  constructor(
    private readonly random: RandomProvider,
    private readonly core: CoreSimulationConfig,
    private readonly config: UniformDynamicsConfig,
  ) {}

  async nextStep(simulation: Simulation, tickIndex: number): Promise<TimedEvent | undefined> {
    if (tickIndex >= this.config.goalCount) return undefined;
    const teamIndex = this.random.int(0, PRESET_TEAMS.length - 1);
    const team = PRESET_TEAMS[teamIndex];
    const delayMs = tickIndex === 0 ? this.config.firstGoalOffsetMs : this.config.goalIntervalMs;
    const intent = new GoalScored(simulation.id, team.id, [], 0, new Date(0));
    return { delayMs, event: intent };
  }
}
```
(`core` field unused right now but kept for parity with future dynamics.)

- [ ] **Step 3: Update orchestrator to drop config dep**

In `src/simulation/application/orchestrator/simulation-orchestrator.ts`:
- Remove `import type { SimulationConfig } from '@simulation/domain/simulation-config'`
- In `SimulationOrchestratorDeps`: replace `readonly config: SimulationConfig` with `readonly cooldownMs: number`
- Replace `this.deps.config.startCooldownMs` with `this.deps.cooldownMs` at line ~171

- [ ] **Step 4: Update SimulationModule factory**

In `src/simulation/simulation.module.ts`:
- Delete `configFromEnv` helper
- Delete `SimulationConfig` import
- In `SimulationOrchestrator` factory: replace `config: configFromEnv(config)` with `cooldownMs: config.get('START_COOLDOWN_MS', { infer: true })`
- In `MATCH_DYNAMICS` factory: pass `core: { durationMs: config.get('SIMULATION_DURATION_MS', { infer: true }) }` and `config: { goalCount: ..., goalIntervalMs: ..., firstGoalOffsetMs: ... }`

```typescript
{
  provide: PORT_TOKENS.MATCH_DYNAMICS,
  useFactory: (random: RandomProvider, config: ConfigService<AppConfig, true>) =>
    new UniformRandomGoalDynamics(
      random,
      { durationMs: config.get('SIMULATION_DURATION_MS', { infer: true }) },
      {
        goalCount: config.get('GOAL_COUNT', { infer: true }),
        goalIntervalMs: config.get('GOAL_INTERVAL_MS', { infer: true }),
        firstGoalOffsetMs: config.get('FIRST_GOAL_OFFSET_MS', { infer: true }),
      },
    ),
  inject: [PORT_TOKENS.RANDOM_PROVIDER, ConfigService],
},
```

- [ ] **Step 5: Same refactor in WorkerModule**

In `src/worker/worker.module.ts`:
- Same MATCH_DYNAMICS factory change
- Delete `configFromEnv` helper
- Delete `SimulationConfig` import

- [ ] **Step 6: Delete the old SimulationConfig file**

```bash
rm src/simulation/domain/simulation-config.ts
```

- [ ] **Step 7: Update test fixtures**

In each test file using `SimulationConfig`:
- Replace `import type { SimulationConfig }` with `import type { CoreSimulationConfig }` or `import type { UniformDynamicsConfig }`
- Replace fixture object: instead of one `{ durationMs, goalIntervalMs, goalCount, firstGoalOffsetMs, startCooldownMs }`, build the right shape per consumer:
  - For `UniformRandomGoalDynamics` constructor: `(random, { durationMs: 9000 }, { goalCount: 9, goalIntervalMs: 1000, firstGoalOffsetMs: 1000 })`
  - For `SimulationOrchestrator` deps: `cooldownMs: 5000` (instead of nested config)
  - Engine tests use dynamics via fake — adjust fake construction if it took config

- [ ] **Step 8: Run all unit + integration tests**

```bash
npx jest --silent --testPathIgnorePatterns="e2e"
```
Expected: all green. If any test fails, fix the fixture shape.

- [ ] **Step 9: Commit**

```bash
git add src/simulation/domain/core-simulation-config.ts \
        src/simulation/domain/simulation-config.ts \
        src/simulation/infrastructure/dynamics/uniform-random-goal-dynamics.ts \
        src/simulation/application/orchestrator/simulation-orchestrator.ts \
        src/simulation/simulation.module.ts \
        src/worker/worker.module.ts \
        test/
git commit -m "refactor(domain): split SimulationConfig into CoreSimulationConfig + UniformDynamicsConfig"
```

---

### Task 3: ADR-005 — AcceleratedClock semantics

**Files:**
- Create: `docs/decisions/005-accelerated-clock-semantics.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR-005: AcceleratedClock — real-time timestamps, accelerated scheduling

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 3

## Context
Phase 3 wants to demo a 90-min match compressed to ~9s wall clock. Engine uses `Clock.sleep(ms, signal)` for tick delays. Two concerns are entangled: virtual time (what the dynamics thinks "match time" is) vs real time (event timestamps, audit trail).

## Options considered
1. **Pure virtual clock**: `now()` returns virtual time, `sleep()` divides by factor. Pro: dynamics & event timestamps fully consistent. Con: event timestamps lose audit value (cannot correlate with real wall clock).
2. **Pure real clock with virtual scheduling**: `now()` real, `sleep()` divides by factor. Pro: timestamps audytowalne. Con: dynamics that read `now()` for elapsed-time decisions get inconsistent view (most don't read `now()` directly though).
3. **Two-clock split**: pass `WallClock` and `VirtualClock` separately. Pro: maximally explicit. Con: API surface grows, engine signature changes, propagates through 5 files.

## Decision
Option 2: `AcceleratedClock` returns real time from `now()` and divides `sleep(ms)` by factor. Engine-side timing accelerates; event timestamps stay real-world (`occurredAt: Date`). Dynamics in our codebase don't call `clock.now()` for scheduling decisions (they accumulate `delayMs` from start), so option 2 is sufficient.

## Consequences
- ✅ Zero changes to engine signature or `Clock` port
- ✅ Event timestamps retain audytowalność (replay analytics in Phase 5 reads real wall-clock dates)
- ✅ Composable: `new AcceleratedClock(systemClock, 600)` wraps any `Clock` impl
- ❌ Dynamics that need elapsed-virtual-time would get wrong values from `now()`. Mitigation: dynamics pass tickIndex + their own accumulator (current pattern).
- 🔄 If Phase 5 introduces a dynamics that needs virtual `now()`, revisit with ADR-NNN (likely option 3 split)

## References
- Phase 3 plan Task 4
- Spec §6 Clock port, §9 Phase 3
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/005-accelerated-clock-semantics.md
git commit -m "docs(adr): ADR-005 — AcceleratedClock semantics (real timestamps + virtual scheduling)"
```

---

### Task 4: AcceleratedClock implementation + tests

**Files:**
- Create: `src/simulation/infrastructure/time/accelerated-clock.ts`
- Create: `test/unit/infrastructure/time/accelerated-clock.spec.ts`

- [ ] **Step 1: Write the failing test**

`test/unit/infrastructure/time/accelerated-clock.spec.ts`:
```typescript
import { AcceleratedClock } from '@simulation/infrastructure/time/accelerated-clock';
import { SystemClock } from '@simulation/infrastructure/time/system-clock';

describe('AcceleratedClock', () => {
  it('returns real time from now() (no acceleration on timestamps)', () => {
    const base = new SystemClock();
    const clock = new AcceleratedClock(base, 100);
    const before = Date.now();
    const now = clock.now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });

  it('sleep(1000) at factor=10 finishes in ~100ms', async () => {
    const clock = new AcceleratedClock(new SystemClock(), 10);
    const start = Date.now();
    await clock.sleep(1000);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(80);
    expect(elapsed).toBeLessThanOrEqual(200);
  });

  it('sleep aborts via AbortSignal', async () => {
    const clock = new AcceleratedClock(new SystemClock(), 1);
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 30);
    await expect(clock.sleep(1000, ac.signal)).rejects.toBeDefined();
  });

  it('throws on factor <= 0', () => {
    expect(() => new AcceleratedClock(new SystemClock(), 0)).toThrow();
    expect(() => new AcceleratedClock(new SystemClock(), -1)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest test/unit/infrastructure/time/accelerated-clock.spec.ts
```
Expected: cannot find module `accelerated-clock`.

- [ ] **Step 3: Implement**

`src/simulation/infrastructure/time/accelerated-clock.ts`:
```typescript
import type { Clock } from '@simulation/domain/ports/clock.port';

/**
 * Wraps any Clock impl, dividing sleep() durations by `factor` while
 * leaving now() untouched. See ADR-005.
 */
export class AcceleratedClock implements Clock {
  constructor(
    private readonly base: Clock,
    private readonly factor: number,
  ) {
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new Error(`AcceleratedClock factor must be > 0, got ${factor}`);
    }
  }

  now(): Date {
    return this.base.now();
  }

  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return this.base.sleep(ms / this.factor, signal);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest test/unit/infrastructure/time/accelerated-clock.spec.ts
```
Expected: 4/4 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/simulation/infrastructure/time/accelerated-clock.ts \
        test/unit/infrastructure/time/accelerated-clock.spec.ts
git commit -m "feat(infra/time): AcceleratedClock — wraps any Clock, scales sleep() by factor"
```

---

### Task 5: RandomProvider extension — float()

**Files:**
- Modify: `src/simulation/domain/ports/random-provider.port.ts`
- Modify: `src/simulation/infrastructure/random/crypto-random-provider.ts`
- Modify: `src/simulation/infrastructure/random/seeded-random-provider.ts`
- Modify: `test/unit/infrastructure/random/crypto-random-provider.spec.ts`
- Modify: `test/unit/infrastructure/random/seeded-random-provider.spec.ts`

- [ ] **Step 1: Write failing tests**

In `test/unit/infrastructure/random/crypto-random-provider.spec.ts`, add:
```typescript
describe('float()', () => {
  it('returns value in [0, 1)', () => {
    const r = new CryptoRandomProvider();
    for (let i = 0; i < 1000; i++) {
      const v = r.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('produces variety (not constant)', () => {
    const r = new CryptoRandomProvider();
    const samples = new Set();
    for (let i = 0; i < 100; i++) samples.add(r.float());
    expect(samples.size).toBeGreaterThan(50);
  });
});
```

In `test/unit/infrastructure/random/seeded-random-provider.spec.ts`, add:
```typescript
describe('float()', () => {
  it('returns value in [0, 1)', () => {
    const r = new SeededRandomProvider(42);
    for (let i = 0; i < 100; i++) {
      const v = r.float();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('is deterministic for same seed', () => {
    const a = new SeededRandomProvider(123);
    const b = new SeededRandomProvider(123);
    for (let i = 0; i < 50; i++) {
      expect(a.float()).toBe(b.float());
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest test/unit/infrastructure/random
```
Expected: `float is not a function`.

- [ ] **Step 3: Extend port**

`src/simulation/domain/ports/random-provider.port.ts`:
```typescript
export interface RandomProvider {
  int(min: number, max: number): number;
  float(): number;
  uuid(): string;
}
```

- [ ] **Step 4: Implement in CryptoRandomProvider**

In `src/simulation/infrastructure/random/crypto-random-provider.ts`:
```typescript
import { randomInt, randomUUID } from 'node:crypto';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';

const FLOAT_DIVISOR = 0x1_0000_0000; // 2^32

export class CryptoRandomProvider implements RandomProvider {
  int(min: number, max: number): number {
    return randomInt(min, max + 1);
  }

  float(): number {
    return randomInt(0, FLOAT_DIVISOR) / FLOAT_DIVISOR;
  }

  uuid(): string {
    return randomUUID();
  }
}
```

- [ ] **Step 5: Implement in SeededRandomProvider**

In `src/simulation/infrastructure/random/seeded-random-provider.ts`, add method:
```typescript
float(): number {
  this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
  return this.state / 0x1_0000_0000;
}
```

- [ ] **Step 6: Run tests**

```bash
npx jest test/unit/infrastructure/random
```
Expected: all PASS (existing + new).

- [ ] **Step 7: Commit**

```bash
git add src/simulation/domain/ports/random-provider.port.ts \
        src/simulation/infrastructure/random/ \
        test/unit/infrastructure/random/
git commit -m "feat(domain/ports): RandomProvider.float() + impl in Crypto + Seeded providers"
```

---

### Task 6: PoissonGoalDynamics — implementation + tests

**Files:**
- Create: `src/simulation/infrastructure/dynamics/poisson-goal-dynamics.ts`
- Create: `test/unit/infrastructure/dynamics/poisson-goal-dynamics.spec.ts`

- [ ] **Step 1: Write failing test (deterministic via SeededRandom)**

`test/unit/infrastructure/dynamics/poisson-goal-dynamics.spec.ts`:
```typescript
import { PoissonGoalDynamics } from '@simulation/infrastructure/dynamics/poisson-goal-dynamics';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import { GoalScored } from '@simulation/domain/events/goal-scored';

function makeSim(id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'): Simulation {
  return Simulation.start({
    id: SimulationId.create(id),
    name: SimulationName.create('Test Match'),
    ownerToken: OwnershipToken.create('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
    profileId: 'poisson-accelerated',
    match: PRESET_MATCHES[0],
    startedAt: new Date(0),
  });
}

describe('PoissonGoalDynamics', () => {
  it('returns undefined when both teams exhausted match duration', async () => {
    const dyn = new PoissonGoalDynamics(
      new SeededRandomProvider(1),
      { durationMs: 100 },
      { goalsPerTeamMean: 0.001 },
    );
    const sim = makeSim();
    let undefinedHits = 0;
    for (let tick = 0; tick < 50; tick++) {
      const r = await dyn.nextStep(sim, tick);
      if (!r) {
        undefinedHits++;
        break;
      }
    }
    expect(undefinedHits).toBe(1);
  });

  it('emits GoalScored intents with valid teamIds', async () => {
    const dyn = new PoissonGoalDynamics(
      new SeededRandomProvider(42),
      { durationMs: 9000 },
      { goalsPerTeamMean: 5 },
    );
    const sim = makeSim();
    const teamIds = sim.toSnapshot().teamIds;
    let goals = 0;
    for (let tick = 0; tick < 50; tick++) {
      const step = await dyn.nextStep(sim, tick);
      if (!step) break;
      expect(step.event).toBeInstanceOf(GoalScored);
      const intent = step.event as GoalScored;
      expect(teamIds).toContain(intent.teamId.value);
      expect(step.delayMs).toBeGreaterThanOrEqual(0);
      goals++;
    }
    expect(goals).toBeGreaterThan(0);
    expect(goals).toBeLessThan(50);
  });

  it('produces ~mean goals per team across many runs (statistical sanity)', async () => {
    const dyn = new PoissonGoalDynamics(
      new SeededRandomProvider(2026),
      { durationMs: 90 * 60 * 1000 },
      { goalsPerTeamMean: 2.7 },
    );
    let totalGoals = 0;
    const runs = 30;
    for (let r = 0; r < runs; r++) {
      const sim = makeSim(`aaaaaaaa-bbbb-4ccc-8ddd-${String(r).padStart(12, '0')}`);
      for (let tick = 0; tick < 200; tick++) {
        const step = await dyn.nextStep(sim, tick);
        if (!step) break;
        totalGoals++;
      }
    }
    const avgPerTeamPerMatch = totalGoals / runs / 2;
    // Wide bounds — Poisson variance is high
    expect(avgPerTeamPerMatch).toBeGreaterThan(1.5);
    expect(avgPerTeamPerMatch).toBeLessThan(4.0);
  });

  it('cleans up state when match ends (no leak)', async () => {
    const dyn = new PoissonGoalDynamics(
      new SeededRandomProvider(7),
      { durationMs: 100 },
      { goalsPerTeamMean: 0.5 },
    );
    const sim = makeSim();
    for (let tick = 0; tick < 30; tick++) {
      const r = await dyn.nextStep(sim, tick);
      if (!r) break;
    }
    expect(dyn.activeStateCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest test/unit/infrastructure/dynamics/poisson-goal-dynamics.spec.ts
```
Expected: cannot find module.

- [ ] **Step 3: Implement**

`src/simulation/infrastructure/dynamics/poisson-goal-dynamics.ts`:
```typescript
import type { MatchDynamics, TimedEvent } from '@simulation/domain/ports/match-dynamics.port';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { CoreSimulationConfig } from '@simulation/domain/core-simulation-config';
import { GoalScored } from '@simulation/domain/events/goal-scored';
import { TeamId } from '@simulation/domain/value-objects/team-id';

export interface PoissonDynamicsConfig {
  /** Expected total goals per team across the entire match duration. */
  readonly goalsPerTeamMean: number;
}

interface RunState {
  /** Cumulative virtual ms since match start when next goal fires, per team index. */
  readonly nextAt: number[];
  /** Cumulative virtual ms of the most recent emitted event. */
  lastEventAt: number;
}

/**
 * Per-team independent Poisson process. Inter-arrival times sampled from
 * exponential distribution: dt = -ln(1 - U) / λ where U ~ Uniform(0,1)
 * and λ = goalsPerTeamMean / durationMs (per-ms rate per team).
 *
 * Stateful per simulationId: state initialised on tick=0 and torn down
 * when both teams exhaust durationMs (returns undefined).
 */
export class PoissonGoalDynamics implements MatchDynamics {
  private readonly state = new Map<string, RunState>();

  constructor(
    private readonly random: RandomProvider,
    private readonly core: CoreSimulationConfig,
    private readonly config: PoissonDynamicsConfig,
  ) {}

  async nextStep(simulation: Simulation, tickIndex: number): Promise<TimedEvent | undefined> {
    const id = simulation.id.value;
    const teamIds = simulation.toSnapshot().teamIds;
    const lambdaPerMs = this.config.goalsPerTeamMean / this.core.durationMs;

    let st = this.state.get(id);
    if (!st || tickIndex === 0) {
      st = { nextAt: teamIds.map(() => this.sampleExp(lambdaPerMs)), lastEventAt: 0 };
      this.state.set(id, st);
    }

    let earliestIdx = 0;
    for (let i = 1; i < st.nextAt.length; i++) {
      if (st.nextAt[i] < st.nextAt[earliestIdx]) earliestIdx = i;
    }

    if (st.nextAt[earliestIdx] > this.core.durationMs) {
      this.state.delete(id);
      return undefined;
    }

    const fireAt = st.nextAt[earliestIdx];
    const delayMs = Math.max(0, fireAt - st.lastEventAt);
    st.lastEventAt = fireAt;
    st.nextAt[earliestIdx] = fireAt + this.sampleExp(lambdaPerMs);

    const intent = new GoalScored(simulation.id, TeamId.create(teamIds[earliestIdx]), [], 0, new Date(0));
    return { delayMs, event: intent };
  }

  /** Visible for tests — verifies cleanup discipline. */
  activeStateCount(): number {
    return this.state.size;
  }

  private sampleExp(lambda: number): number {
    const u = Math.max(this.random.float(), Number.EPSILON);
    return -Math.log(u) / lambda;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest test/unit/infrastructure/dynamics/poisson-goal-dynamics.spec.ts
```
Expected: 4/4 PASS.

If `simulation.toSnapshot().teamIds` doesn't exist, check `Simulation` aggregate API and adapt — the snapshot must expose team ids in some form (likely `match.teams`).

- [ ] **Step 5: Commit**

```bash
git add src/simulation/infrastructure/dynamics/poisson-goal-dynamics.ts \
        test/unit/infrastructure/dynamics/poisson-goal-dynamics.spec.ts
git commit -m "feat(infra/dynamics): PoissonGoalDynamics — per-team Poisson process with exponential inter-arrival"
```

---

### Task 7: FastMarkovDynamics — implementation + tests

**Files:**
- Create: `src/simulation/infrastructure/dynamics/fast-markov-dynamics.ts`
- Create: `test/unit/infrastructure/dynamics/fast-markov-dynamics.spec.ts`

- [ ] **Step 1: Write failing test**

`test/unit/infrastructure/dynamics/fast-markov-dynamics.spec.ts`:
```typescript
import { FastMarkovDynamics } from '@simulation/infrastructure/dynamics/fast-markov-dynamics';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import { GoalScored } from '@simulation/domain/events/goal-scored';

function makeSim(id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'): Simulation {
  return Simulation.start({
    id: SimulationId.create(id),
    name: SimulationName.create('Test Match'),
    ownerToken: OwnershipToken.create('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'),
    profileId: 'fast-markov',
    match: PRESET_MATCHES[0],
    startedAt: new Date(0),
  });
}

describe('FastMarkovDynamics', () => {
  it('emits goal intents only on GOAL transitions', async () => {
    const dyn = new FastMarkovDynamics(
      new SeededRandomProvider(11),
      { durationMs: 30_000 },
      { stepMs: 100 },
    );
    const sim = makeSim();
    const teamIds = sim.toSnapshot().teamIds;
    let goals = 0;
    let stepCount = 0;
    for (let tick = 0; tick < 1000; tick++) {
      const step = await dyn.nextStep(sim, tick);
      if (!step) break;
      stepCount++;
      if (step.event instanceof GoalScored) {
        expect(teamIds).toContain((step.event as GoalScored).teamId.value);
        goals++;
      }
    }
    expect(stepCount).toBeGreaterThan(0);
    expect(goals).toBeGreaterThan(0);
  });

  it('respects durationMs — returns undefined after maxSteps', async () => {
    const dyn = new FastMarkovDynamics(
      new SeededRandomProvider(3),
      { durationMs: 1000 },
      { stepMs: 100 },
    );
    const sim = makeSim();
    let totalDelay = 0;
    for (let tick = 0; tick < 100; tick++) {
      const step = await dyn.nextStep(sim, tick);
      if (!step) break;
      totalDelay += step.delayMs;
    }
    expect(totalDelay).toBeLessThanOrEqual(1000);
  });

  it('emits non-goal events with zero delay (transitions are step-paced)', async () => {
    const dyn = new FastMarkovDynamics(
      new SeededRandomProvider(99),
      { durationMs: 5000 },
      { stepMs: 50 },
    );
    const sim = makeSim();
    for (let tick = 0; tick < 30; tick++) {
      const step = await dyn.nextStep(sim, tick);
      if (!step) break;
      expect(step.delayMs).toBe(50);
    }
  });

  it('cleans up state when match ends', async () => {
    const dyn = new FastMarkovDynamics(
      new SeededRandomProvider(5),
      { durationMs: 200 },
      { stepMs: 100 },
    );
    const sim = makeSim();
    for (let tick = 0; tick < 20; tick++) {
      if (!(await dyn.nextStep(sim, tick))) break;
    }
    expect(dyn.activeStateCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest test/unit/infrastructure/dynamics/fast-markov-dynamics.spec.ts
```
Expected: cannot find module.

- [ ] **Step 3: Implement**

`src/simulation/infrastructure/dynamics/fast-markov-dynamics.ts`:
```typescript
import type { MatchDynamics, TimedEvent } from '@simulation/domain/ports/match-dynamics.port';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { CoreSimulationConfig } from '@simulation/domain/core-simulation-config';
import { GoalScored } from '@simulation/domain/events/goal-scored';
import { TeamId } from '@simulation/domain/value-objects/team-id';

export interface MarkovDynamicsConfig {
  /** Wall-clock-virtual ms between Markov transitions. */
  readonly stepMs: number;
}

type State =
  | 'MIDFIELD_POSSESSION'
  | 'OFFENSIVE_ATTACK_HOME'
  | 'OFFENSIVE_ATTACK_AWAY'
  | 'SHOT_HOME'
  | 'SHOT_AWAY'
  | 'GOAL_HOME'
  | 'GOAL_AWAY'
  | 'COUNTER_HOME'
  | 'COUNTER_AWAY'
  | 'DEFENSIVE_BLOCK';

interface Transition {
  readonly to: State;
  readonly p: number;
}

const TRANSITIONS: Record<State, Transition[]> = {
  MIDFIELD_POSSESSION: [
    { to: 'OFFENSIVE_ATTACK_HOME', p: 0.30 },
    { to: 'OFFENSIVE_ATTACK_AWAY', p: 0.30 },
    { to: 'DEFENSIVE_BLOCK', p: 0.20 },
    { to: 'COUNTER_HOME', p: 0.10 },
    { to: 'COUNTER_AWAY', p: 0.10 },
  ],
  OFFENSIVE_ATTACK_HOME: [
    { to: 'SHOT_HOME', p: 0.45 },
    { to: 'MIDFIELD_POSSESSION', p: 0.55 },
  ],
  OFFENSIVE_ATTACK_AWAY: [
    { to: 'SHOT_AWAY', p: 0.45 },
    { to: 'MIDFIELD_POSSESSION', p: 0.55 },
  ],
  SHOT_HOME: [
    { to: 'GOAL_HOME', p: 0.12 },
    { to: 'DEFENSIVE_BLOCK', p: 0.50 },
    { to: 'COUNTER_AWAY', p: 0.38 },
  ],
  SHOT_AWAY: [
    { to: 'GOAL_AWAY', p: 0.12 },
    { to: 'DEFENSIVE_BLOCK', p: 0.50 },
    { to: 'COUNTER_HOME', p: 0.38 },
  ],
  GOAL_HOME: [{ to: 'MIDFIELD_POSSESSION', p: 1.0 }],
  GOAL_AWAY: [{ to: 'MIDFIELD_POSSESSION', p: 1.0 }],
  COUNTER_HOME: [
    { to: 'SHOT_HOME', p: 0.40 },
    { to: 'MIDFIELD_POSSESSION', p: 0.60 },
  ],
  COUNTER_AWAY: [
    { to: 'SHOT_AWAY', p: 0.40 },
    { to: 'MIDFIELD_POSSESSION', p: 0.60 },
  ],
  DEFENSIVE_BLOCK: [
    { to: 'MIDFIELD_POSSESSION', p: 0.70 },
    { to: 'COUNTER_HOME', p: 0.15 },
    { to: 'COUNTER_AWAY', p: 0.15 },
  ],
};

interface RunState {
  current: State;
  elapsedMs: number;
}

export class FastMarkovDynamics implements MatchDynamics {
  private readonly state = new Map<string, RunState>();

  constructor(
    private readonly random: RandomProvider,
    private readonly core: CoreSimulationConfig,
    private readonly config: MarkovDynamicsConfig,
  ) {}

  async nextStep(simulation: Simulation, tickIndex: number): Promise<TimedEvent | undefined> {
    const id = simulation.id.value;
    const teamIds = simulation.toSnapshot().teamIds;
    const [homeId, awayId] = teamIds;

    let st = this.state.get(id);
    if (!st || tickIndex === 0) {
      st = { current: 'MIDFIELD_POSSESSION', elapsedMs: 0 };
      this.state.set(id, st);
    }

    if (st.elapsedMs >= this.core.durationMs) {
      this.state.delete(id);
      return undefined;
    }

    const next = this.pickTransition(st.current);
    st.current = next;
    st.elapsedMs += this.config.stepMs;

    if (next === 'GOAL_HOME' || next === 'GOAL_AWAY') {
      const teamId = next === 'GOAL_HOME' ? homeId : awayId;
      const intent = new GoalScored(simulation.id, TeamId.create(teamId), [], 0, new Date(0));
      return { delayMs: this.config.stepMs, event: intent };
    }

    // Non-goal transitions still advance virtual time but emit a "no-op" intent.
    // Engine's dispatchIntent only handles GoalScored; anything else triggers
    // an error. So for Phase 3 we only emit a TimedEvent when state is GOAL_*.
    // Skip non-goal transitions by recursing — keep going until we hit a goal
    // or run out of time.
    return this.nextStep(simulation, tickIndex + 1);
  }

  activeStateCount(): number {
    return this.state.size;
  }

  private pickTransition(from: State): State {
    const u = this.random.float();
    let cum = 0;
    const transitions = TRANSITIONS[from];
    for (const t of transitions) {
      cum += t.p;
      if (u < cum) return t.to;
    }
    return transitions[transitions.length - 1].to;
  }
}
```

> **Note on the recursion**: TickingSimulationEngine only knows how to dispatch `GoalScored` intents. To stay within that contract in Phase 3, FastMarkovDynamics internally walks states until it hits a goal, then emits one `TimedEvent` representing that goal. The `delayMs` reflects only the final step (the goal transition itself). For richer event modelling (Phase 5), the engine + dynamics contract gets extended to handle non-goal events.

- [ ] **Step 4: Adjust test for recursion-collapsed delay**

The third test currently expects `delayMs === 50` for every step. With internal recursion only goal transitions are returned. Update test:
```typescript
it('returns delayMs equal to single stepMs (final goal-transition step)', async () => {
  const dyn = new FastMarkovDynamics(
    new SeededRandomProvider(99),
    { durationMs: 5000 },
    { stepMs: 50 },
  );
  const sim = makeSim();
  const step = await dyn.nextStep(sim, 0);
  if (step) expect(step.delayMs).toBe(50);
});
```

- [ ] **Step 5: Run tests**

```bash
npx jest test/unit/infrastructure/dynamics/fast-markov-dynamics.spec.ts
```
Expected: 4/4 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/simulation/infrastructure/dynamics/fast-markov-dynamics.ts \
        test/unit/infrastructure/dynamics/fast-markov-dynamics.spec.ts
git commit -m "feat(infra/dynamics): FastMarkovDynamics — state-machine with transition matrix, goal-only intents"
```

---

### Task 8: ADR-003 — Profile registry

**Files:**
- Create: `docs/decisions/003-profile-registry.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR-003: Profile registry — single const map shared by orchestrator and worker

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 3

## Context
Phase 3 introduces multiple `(MatchDynamics, Clock, config)` combinations as named profiles. Two sides need access to the registry: orchestrator (Zod whitelist for `POST /simulations { profile }`) and worker (DI override based on `SIMULATION_PROFILE` env). Three options for storing this registry.

## Options considered
1. **DB-backed registry** — Postgres table `profiles { id, dynamicsClass, clockClass, config }`. Pros: dynamic, can add profiles at runtime. Cons: massive overkill, requires DB before Phase 4, profiles are code (factories), can't really live in DB.
2. **Env-defined registry** — `PROFILES_JSON='[{"id":"poisson","dynamics":"PoissonGoalDynamics",...}]'`. Pros: ops-tunable. Cons: env can't reference TS classes, requires reflection / DI string lookup, fragile.
3. **Const map in code** — `export const PROFILES: Record<string, Profile>` in `src/simulation/infrastructure/profiles/profile-registry.ts`. Pros: type-safe, factories are TS functions, both modules import same source of truth. Cons: adding a profile requires code change + redeploy.

## Decision
Option 3. Profiles are inherently code (factories with class references) — DB/env can't represent them. Compile-time registry. Adding a profile = new file + entry in registry + redeploy. Worker reads env to pick which one. Orchestrator reads `Object.keys(PROFILES)` for Zod whitelist.

## Consequences
- ✅ Type-safe end-to-end (Zod enum literally references `PROFILE_IDS` array)
- ✅ Both sides pull from same source — impossible to drift
- ✅ Profile factories can capture local config (tunable per profile in code)
- ❌ Adding profile = code change + redeploy. Acceptable for our cadence.
- 🔄 If Phase 6+ wants ops-pluggable profiles, can swap to file-based loading at startup with same `PROFILES` shape.

## References
- Phase 3 plan Tasks 9-11
- Spec §3.6, §7.6
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/003-profile-registry.md
git commit -m "docs(adr): ADR-003 — Profile registry as const map shared by orchestrator and worker"
```

---

### Task 9: Profile interface + registry

**Files:**
- Create: `src/simulation/infrastructure/profiles/profile.ts`
- Create: `src/simulation/infrastructure/profiles/uniform-realtime.profile.ts`
- Create: `src/simulation/infrastructure/profiles/poisson-accelerated.profile.ts`
- Create: `src/simulation/infrastructure/profiles/fast-markov.profile.ts`
- Create: `src/simulation/infrastructure/profiles/profile-registry.ts`
- Create: `test/unit/infrastructure/profiles/profile-registry.spec.ts`

- [ ] **Step 1: Write failing test**

`test/unit/infrastructure/profiles/profile-registry.spec.ts`:
```typescript
import { PROFILES, PROFILE_IDS, getProfile } from '@simulation/infrastructure/profiles/profile-registry';
import { CryptoRandomProvider } from '@simulation/infrastructure/random/crypto-random-provider';
import { SystemClock } from '@simulation/infrastructure/time/system-clock';

describe('Profile registry', () => {
  it('exposes the three Phase 3 profiles', () => {
    expect(PROFILE_IDS).toEqual(
      expect.arrayContaining(['uniform-realtime', 'poisson-accelerated', 'fast-markov']),
    );
    expect(PROFILE_IDS).toHaveLength(3);
  });

  it('getProfile returns the matching profile', () => {
    const p = getProfile('uniform-realtime');
    expect(p).toBeDefined();
    expect(p.id).toBe('uniform-realtime');
  });

  it('getProfile throws on unknown', () => {
    expect(() => getProfile('does-not-exist')).toThrow(/unknown profile/i);
  });

  it('each profile produces a working dynamics + clock pair', () => {
    const random = new CryptoRandomProvider();
    for (const id of PROFILE_IDS) {
      const p = getProfile(id);
      const dyn = p.dynamicsFactory({ random });
      const clk = p.clockFactory();
      expect(dyn).toBeDefined();
      expect(clk).toBeDefined();
      expect(typeof clk.now).toBe('function');
    }
  });

  it('uniform-realtime profile uses SystemClock (factor 1)', () => {
    const p = getProfile('uniform-realtime');
    const clk = p.clockFactory();
    expect(clk).toBeInstanceOf(SystemClock);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest test/unit/infrastructure/profiles/profile-registry.spec.ts
```
Expected: cannot find module.

- [ ] **Step 3: Implement Profile interface**

`src/simulation/infrastructure/profiles/profile.ts`:
```typescript
import type { Clock } from '@simulation/domain/ports/clock.port';
import type { MatchDynamics } from '@simulation/domain/ports/match-dynamics.port';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { CoreSimulationConfig } from '@simulation/domain/core-simulation-config';

export interface ProfileDynamicsDeps {
  readonly random: RandomProvider;
}

export interface Profile {
  readonly id: string;
  readonly coreConfig: CoreSimulationConfig;
  readonly dynamicsFactory: (deps: ProfileDynamicsDeps) => MatchDynamics;
  readonly clockFactory: () => Clock;
}
```

- [ ] **Step 4: Implement uniform-realtime profile**

`src/simulation/infrastructure/profiles/uniform-realtime.profile.ts`:
```typescript
import { SystemClock } from '@simulation/infrastructure/time/system-clock';
import { UniformRandomGoalDynamics } from '@simulation/infrastructure/dynamics/uniform-random-goal-dynamics';
import type { Profile } from './profile';

export const UNIFORM_REALTIME_PROFILE: Profile = {
  id: 'uniform-realtime',
  coreConfig: { durationMs: 9000 },
  dynamicsFactory: ({ random }) =>
    new UniformRandomGoalDynamics(
      random,
      { durationMs: 9000 },
      { goalCount: 9, goalIntervalMs: 1000, firstGoalOffsetMs: 1000 },
    ),
  clockFactory: () => new SystemClock(),
};
```

- [ ] **Step 5: Implement poisson-accelerated profile**

`src/simulation/infrastructure/profiles/poisson-accelerated.profile.ts`:
```typescript
import { SystemClock } from '@simulation/infrastructure/time/system-clock';
import { AcceleratedClock } from '@simulation/infrastructure/time/accelerated-clock';
import { PoissonGoalDynamics } from '@simulation/infrastructure/dynamics/poisson-goal-dynamics';
import type { Profile } from './profile';

const NINETY_MIN_MS = 90 * 60 * 1000;
const ACCEL_FACTOR = 600;

export const POISSON_ACCELERATED_PROFILE: Profile = {
  id: 'poisson-accelerated',
  coreConfig: { durationMs: NINETY_MIN_MS },
  dynamicsFactory: ({ random }) =>
    new PoissonGoalDynamics(
      random,
      { durationMs: NINETY_MIN_MS },
      { goalsPerTeamMean: 2.7 },
    ),
  clockFactory: () => new AcceleratedClock(new SystemClock(), ACCEL_FACTOR),
};
```

- [ ] **Step 6: Implement fast-markov profile**

`src/simulation/infrastructure/profiles/fast-markov.profile.ts`:
```typescript
import { SystemClock } from '@simulation/infrastructure/time/system-clock';
import { AcceleratedClock } from '@simulation/infrastructure/time/accelerated-clock';
import { FastMarkovDynamics } from '@simulation/infrastructure/dynamics/fast-markov-dynamics';
import type { Profile } from './profile';

const MATCH_DURATION_MS = 90 * 60 * 1000;
const ACCEL_FACTOR = 1000;
const STEP_MS = 1000;

export const FAST_MARKOV_PROFILE: Profile = {
  id: 'fast-markov',
  coreConfig: { durationMs: MATCH_DURATION_MS },
  dynamicsFactory: ({ random }) =>
    new FastMarkovDynamics(
      random,
      { durationMs: MATCH_DURATION_MS },
      { stepMs: STEP_MS },
    ),
  clockFactory: () => new AcceleratedClock(new SystemClock(), ACCEL_FACTOR),
};
```

- [ ] **Step 7: Implement registry**

`src/simulation/infrastructure/profiles/profile-registry.ts`:
```typescript
import type { Profile } from './profile';
import { UNIFORM_REALTIME_PROFILE } from './uniform-realtime.profile';
import { POISSON_ACCELERATED_PROFILE } from './poisson-accelerated.profile';
import { FAST_MARKOV_PROFILE } from './fast-markov.profile';

export const PROFILES: Readonly<Record<string, Profile>> = Object.freeze({
  [UNIFORM_REALTIME_PROFILE.id]: UNIFORM_REALTIME_PROFILE,
  [POISSON_ACCELERATED_PROFILE.id]: POISSON_ACCELERATED_PROFILE,
  [FAST_MARKOV_PROFILE.id]: FAST_MARKOV_PROFILE,
});

export const PROFILE_IDS: readonly string[] = Object.freeze(Object.keys(PROFILES));

export const DEFAULT_PROFILE_ID = UNIFORM_REALTIME_PROFILE.id;

export function getProfile(id: string): Profile {
  const p = PROFILES[id];
  if (!p) throw new Error(`Unknown profile: "${id}". Available: ${PROFILE_IDS.join(', ')}`);
  return p;
}
```

- [ ] **Step 8: Run tests**

```bash
npx jest test/unit/infrastructure/profiles/profile-registry.spec.ts
```
Expected: 5/5 PASS.

- [ ] **Step 9: Commit**

```bash
git add src/simulation/infrastructure/profiles/ \
        test/unit/infrastructure/profiles/
git commit -m "feat(infra/profiles): Profile interface + registry of 3 Phase-3 profiles"
```

---

### Task 10: ADR-004 — Per-profile topic routing

**Files:**
- Create: `docs/decisions/004-per-profile-topic-routing.md`

- [ ] **Step 1: Write the ADR**

```markdown
# ADR-004: Per-profile topic routing — `simulation.run.{profileId}`

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 3

## Context
Phase 3 splits worker pool by profile. Need to route `RunSimulation` commands to the correct worker subset. Three options.

## Options considered
1. **Single `simulation.run` topic + header/payload-based filtering** — all workers consume one queue, drop jobs not matching their profile via `if (cmd.profileId !== this.profileId) requeue()`. Pros: one queue. Cons: every worker reads every job, terrible scaling, requeue loops, broken backpressure.
2. **One topic per profile** (this ADR) — `simulation.run.uniform-realtime`, `simulation.run.poisson-accelerated`, `simulation.run.fast-markov`. Each worker subscribes to exactly one. Native BullMQ partitioning.
3. **Sharded routing via consumer groups** — only available in Kafka, not BullMQ. Out of scope.

## Decision
Option 2. `SIMULATION_TOPICS.RUN(profileId)` already exists in code (`src/simulation/application/commands/simulation-topics.ts`) — just needs to be wired through. Orchestrator dispatches with profileId. Worker reads `SIMULATION_PROFILE` env and subscribes to that one topic.

## Consequences
- ✅ Native BullMQ partitioning — no application-level filtering
- ✅ Per-profile scaling: `docker compose scale worker-poisson=5` adds consumers only to that topic
- ✅ Per-profile metrics: dashboard already shows queue counts per topic
- ❌ N profiles = N queues. Each worker maintains 1 queue connection (cheap).
- ❌ If profile has zero subscribers, jobs pile up (see ADR D8 — Phase 6 readiness gate fixes this)

## References
- Phase 3 plan Tasks 12-14
- Spec §7.1, §7.6
```

- [ ] **Step 2: Commit**

```bash
git add docs/decisions/004-per-profile-topic-routing.md
git commit -m "docs(adr): ADR-004 — Per-profile topic routing simulation.run.{profileId}"
```

---

### Task 11: API — profile field in CreateSimulationRequest

**Files:**
- Modify: `src/simulation/infrastructure/consumer/http/dto/create-simulation.request.ts`
- Modify: `src/simulation/infrastructure/consumer/http/simulation.controller.ts`
- Create: `test/unit/infrastructure/consumer/http/dto/create-simulation.request.spec.ts` (if not exists)

- [ ] **Step 1: Write failing test for DTO whitelist**

If a test file for the DTO doesn't exist, create one:
`test/unit/infrastructure/consumer/http/dto/create-simulation.request.spec.ts`:
```typescript
import { CreateSimulationRequestSchema } from '@simulation/infrastructure/consumer/http/dto/create-simulation.request';

describe('CreateSimulationRequest', () => {
  it('accepts request without profile (defaults to uniform-realtime)', () => {
    const r = CreateSimulationRequestSchema.parse({ name: 'Katar 2023' });
    expect(r.profile).toBe('uniform-realtime');
  });

  it('accepts known profile values', () => {
    for (const p of ['uniform-realtime', 'poisson-accelerated', 'fast-markov']) {
      const r = CreateSimulationRequestSchema.parse({ name: 'Katar 2023', profile: p });
      expect(r.profile).toBe(p);
    }
  });

  it('rejects unknown profile', () => {
    expect(() =>
      CreateSimulationRequestSchema.parse({ name: 'Katar 2023', profile: 'nonsense' }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest test/unit/infrastructure/consumer/http/dto/create-simulation.request.spec.ts
```
Expected: schema currently has no `profile` field — test for default fails.

- [ ] **Step 3: Update DTO**

Replace `src/simulation/infrastructure/consumer/http/dto/create-simulation.request.ts`:
```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { SimulationNameSchema } from '@simulation/domain/value-objects/simulation-name';
import { PROFILE_IDS, DEFAULT_PROFILE_ID } from '@simulation/infrastructure/profiles/profile-registry';

const ProfileSchema = z.enum(PROFILE_IDS as [string, ...string[]]).default(DEFAULT_PROFILE_ID);

export const CreateSimulationRequestSchema = z.object({
  name: SimulationNameSchema,
  profile: ProfileSchema,
});

export class CreateSimulationRequestDto extends createZodDto(CreateSimulationRequestSchema) {}
```

- [ ] **Step 4: Update controller to pass profile**

In `src/simulation/infrastructure/consumer/http/simulation.controller.ts`:
- Find the POST handler that calls `orchestrator.startSimulation(...)`
- Add `profileId: body.profile` to the input

Example (replace existing `startSimulation` call):
```typescript
const result = await this.orchestrator.startSimulation({
  name: body.name,
  ownerToken: tokenHeader ? OwnershipToken.create(tokenHeader) : undefined,
  profileId: body.profile,
});
```

- [ ] **Step 5: Run all controller + DTO tests**

```bash
npx jest test/unit/infrastructure/consumer/http
```
Expected: all PASS. Existing controller tests still work (orchestrator already accepts optional profileId).

- [ ] **Step 6: Commit**

```bash
git add src/simulation/infrastructure/consumer/http/ \
        test/unit/infrastructure/consumer/http/
git commit -m "feat(http): POST /simulations accepts optional profile (Zod whitelist)"
```

---

### Task 12: Env schema — SIMULATION_PROFILE

**Files:**
- Modify: `src/shared/config/config.schema.ts`
- Modify: `test/unit/shared/config/config.schema.spec.ts` (if exists; else create)

- [ ] **Step 1: Write failing test**

In `test/unit/shared/config/config.schema.spec.ts` (create if missing):
```typescript
import { ConfigSchema } from '@shared/config/config.schema';

describe('ConfigSchema — SIMULATION_PROFILE', () => {
  it('defaults to uniform-realtime', () => {
    const c = ConfigSchema.parse({});
    expect(c.SIMULATION_PROFILE).toBe('uniform-realtime');
  });

  it('accepts each known profile', () => {
    for (const p of ['uniform-realtime', 'poisson-accelerated', 'fast-markov']) {
      const c = ConfigSchema.parse({ SIMULATION_PROFILE: p });
      expect(c.SIMULATION_PROFILE).toBe(p);
    }
  });

  it('rejects unknown profile', () => {
    expect(() => ConfigSchema.parse({ SIMULATION_PROFILE: 'mystery' })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx jest test/unit/shared/config
```
Expected: SIMULATION_PROFILE undefined in schema.

- [ ] **Step 3: Add to schema**

In `src/shared/config/config.schema.ts`, add inside `z.object({ ... })`:
```typescript
SIMULATION_PROFILE: z
  .enum(['uniform-realtime', 'poisson-accelerated', 'fast-markov'])
  .default('uniform-realtime'),
```

> **Note**: We hardcode the list here (rather than importing `PROFILE_IDS`) because the config schema should not depend on infrastructure/profiles (config is loaded before DI). Drift between this enum and `PROFILES` is caught by Task 13 (registry test runs both).

- [ ] **Step 4: Run tests**

```bash
npx jest test/unit/shared/config
```
Expected: 3/3 PASS.

- [ ] **Step 5: Add cross-validation test**

Add to `test/unit/infrastructure/profiles/profile-registry.spec.ts`:
```typescript
import { ConfigSchema } from '@shared/config/config.schema';

it('config schema profile enum stays in sync with registry', () => {
  // Parse with each registry id — should accept all
  for (const id of PROFILE_IDS) {
    expect(() => ConfigSchema.parse({ SIMULATION_PROFILE: id })).not.toThrow();
  }
  // The schema should also have exactly PROFILE_IDS values — fragile to assert directly,
  // but if a profile is removed from registry but stays in schema, registry test catches it.
});
```

- [ ] **Step 6: Run all tests, commit**

```bash
npx jest --silent --testPathIgnorePatterns="e2e"
git add src/shared/config/config.schema.ts test/unit/
git commit -m "feat(config): SIMULATION_PROFILE env var (default uniform-realtime)"
```

---

### Task 13: WorkerModule — env-driven profile selection

**Files:**
- Modify: `src/worker/worker.module.ts`
- Modify: `test/unit/application/worker/simulation-worker.handler.spec.ts` (only if it constructs WorkerModule directly)

- [ ] **Step 1: Replace hardcoded DEFAULT_PROFILE_ID**

Replace `src/worker/worker.module.ts` (full file):
```typescript
import { Module, type OnModuleInit, type OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '@shared/config/config.schema';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { CryptoRandomProvider } from '@simulation/infrastructure/random/crypto-random-provider';
import { TickingSimulationEngine } from '@simulation/infrastructure/engine/ticking-simulation-engine';
import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';
import { getProfile } from '@simulation/infrastructure/profiles/profile-registry';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { Clock } from '@simulation/domain/ports/clock.port';
import type { MatchDynamics } from '@simulation/domain/ports/match-dynamics.port';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { EventPublisher } from '@simulation/domain/ports/event-publisher.port';
import type { SimulationEngine } from '@simulation/domain/ports/simulation-engine.port';
import type { CommandBus } from '@shared/messaging/command-bus.port';
import type { EventBus } from '@shared/messaging/event-bus.port';

async function shutdownIfPossible(bus: unknown): Promise<void> {
  if (
    bus &&
    typeof bus === 'object' &&
    'shutdown' in bus &&
    typeof (bus as { shutdown?: unknown }).shutdown === 'function'
  ) {
    await (bus as { shutdown: () => Promise<void> }).shutdown();
  }
}

@Module({
  providers: [
    { provide: PORT_TOKENS.RANDOM_PROVIDER, useClass: CryptoRandomProvider },
    {
      provide: PORT_TOKENS.CLOCK,
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const profileId = config.get('SIMULATION_PROFILE', { infer: true });
        return getProfile(profileId).clockFactory();
      },
      inject: [ConfigService],
    },
    {
      provide: PORT_TOKENS.MATCH_DYNAMICS,
      useFactory: (random: RandomProvider, config: ConfigService<AppConfig, true>) => {
        const profileId = config.get('SIMULATION_PROFILE', { infer: true });
        return getProfile(profileId).dynamicsFactory({ random });
      },
      inject: [PORT_TOKENS.RANDOM_PROVIDER, ConfigService],
    },
    {
      provide: PORT_TOKENS.SIMULATION_REPOSITORY,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const { createRedisClient } = await import('../shared/infrastructure/redis.client');
        const { RedisSimulationRepository } =
          await import('../simulation/infrastructure/persistence/redis-simulation.repository');
        const { PRESET_MATCHES } =
          await import('../simulation/domain/value-objects/matches-preset');
        const client = createRedisClient(config.get('REDIS_URL', { infer: true }));
        await client.connect();
        return new RedisSimulationRepository(client, PRESET_MATCHES);
      },
      inject: [ConfigService],
    },
    {
      provide: PORT_TOKENS.COMMAND_BUS,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const { BullMQCommandBus } = await import('../shared/messaging/bullmq-command-bus');
        return new BullMQCommandBus(config.get('REDIS_URL', { infer: true }));
      },
      inject: [ConfigService],
    },
    {
      provide: PORT_TOKENS.EVENT_BUS,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const { BullMQEventBus } = await import('../shared/messaging/bullmq-event-bus');
        return new BullMQEventBus(config.get('REDIS_URL', { infer: true }));
      },
      inject: [ConfigService],
    },
    {
      provide: PORT_TOKENS.EVENT_PUBLISHER,
      useFactory: async (bus: EventBus) => {
        const { InMemoryEventPublisher } =
          await import('../shared/messaging/in-memory-event-publisher');
        return new InMemoryEventPublisher(bus);
      },
      inject: [PORT_TOKENS.EVENT_BUS],
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
        config: ConfigService<AppConfig, true>,
      ) =>
        new SimulationWorkerHandler({
          simulationRepository: simRepo,
          commandBus: cmdBus,
          eventPublisher: publisher,
          engine,
          clock,
          profileId: config.get('SIMULATION_PROFILE', { infer: true }),
        }),
      inject: [
        PORT_TOKENS.SIMULATION_REPOSITORY,
        PORT_TOKENS.COMMAND_BUS,
        PORT_TOKENS.EVENT_PUBLISHER,
        PORT_TOKENS.SIMULATION_ENGINE,
        PORT_TOKENS.CLOCK,
        ConfigService,
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
    await shutdownIfPossible(this.commandBus);
    await shutdownIfPossible(this.eventBus);
  }
}
```

- [ ] **Step 2: Run tests**

```bash
npx jest --silent --testPathIgnorePatterns="e2e"
```
Expected: all PASS (worker handler unit test should already pass; it doesn't directly construct WorkerModule).

- [ ] **Step 3: Commit**

```bash
git add src/worker/worker.module.ts
git commit -m "feat(worker): WorkerModule reads SIMULATION_PROFILE env, picks dynamics+clock from registry"
```

---

### Task 14: docker-compose.yml — three worker services

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Replace `worker` service with three named ones**

Replace the `worker:` block in `docker-compose.yml`:
```yaml
  worker-uniform:
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
      SIMULATION_PROFILE: uniform-realtime
    deploy:
      replicas: 2
    restart: unless-stopped

  worker-poisson:
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
      SIMULATION_PROFILE: poisson-accelerated
    deploy:
      replicas: 1
    restart: unless-stopped

  worker-markov:
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
      SIMULATION_PROFILE: fast-markov
    deploy:
      replicas: 1
    restart: unless-stopped
```

- [ ] **Step 2: Smoke test compose**

```bash
docker compose build
docker compose up -d
docker compose ps
```
Expected: 5 services running (`redis`, `orchestrator`, `worker-uniform` ×2, `worker-poisson` ×1, `worker-markov` ×1).

```bash
curl -s http://localhost:3000/admin/stats 2>/dev/null | head -c 200 || echo "(admin endpoint not on this branch — skip)"
```

- [ ] **Step 3: Manual smoke — POST with each profile**

```bash
for p in uniform-realtime poisson-accelerated fast-markov; do
  echo "=== profile: $p ==="
  curl -s -X POST http://localhost:3000/simulations \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Phase3 Demo $p\",\"profile\":\"$p\"}"
  echo
  sleep 7
done
```
Expected: each returns `{simulationId, ownershipToken}`. After ~10s `GET /simulations` shows three FINISHED with possibly different totalGoals patterns.

- [ ] **Step 4: Tear down compose**

```bash
docker compose down
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "chore(docker): split worker into worker-uniform/poisson/markov services per profile"
```

---

### Task 15: Integration test — per-profile routing (Testcontainers)

**Files:**
- Create: `test/integration/distributed/per-profile-routing.spec.ts`

- [ ] **Step 1: Write the test**

`test/integration/distributed/per-profile-routing.spec.ts`:
```typescript
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { BullMQCommandBus } from '@shared/messaging/bullmq-command-bus';
import { SIMULATION_TOPICS } from '@simulation/application/commands/simulation-topics';
import { runSimulationCommand } from '@simulation/application/commands/run-simulation.command';

describe('Per-profile topic routing (Redis Testcontainer)', () => {
  let container: StartedTestContainer;
  let redisUrl: string;
  const buses: BullMQCommandBus[] = [];

  beforeAll(async () => {
    container = await new GenericContainer('redis:7-alpine')
      .withExposedPorts(6379)
      .start();
    const port = container.getMappedPort(6379);
    redisUrl = `redis://${container.getHost()}:${port}`;
  }, 60_000);

  afterAll(async () => {
    for (const b of buses) await b.shutdown();
    await container.stop();
  }, 60_000);

  function bus(): BullMQCommandBus {
    const b = new BullMQCommandBus(redisUrl);
    buses.push(b);
    return b;
  }

  it('worker subscribed to "uniform-realtime" does NOT receive "poisson-accelerated" job', async () => {
    const producer = bus();
    const uniformConsumer = bus();
    const poissonConsumer = bus();

    let uniformReceived = 0;
    let poissonReceived = 0;
    await uniformConsumer.subscribe(SIMULATION_TOPICS.RUN('uniform-realtime'), async () => {
      uniformReceived++;
    });
    await poissonConsumer.subscribe(SIMULATION_TOPICS.RUN('poisson-accelerated'), async () => {
      poissonReceived++;
    });

    await producer.dispatch(
      SIMULATION_TOPICS.RUN('poisson-accelerated'),
      runSimulationCommand('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'poisson-accelerated'),
    );

    await new Promise((r) => setTimeout(r, 1500));
    expect(poissonReceived).toBe(1);
    expect(uniformReceived).toBe(0);
  }, 30_000);

  it('two workers on same profile share load', async () => {
    const producer = bus();
    const consumerA = bus();
    const consumerB = bus();

    let aCount = 0;
    let bCount = 0;
    await consumerA.subscribe(SIMULATION_TOPICS.RUN('fast-markov'), async () => {
      aCount++;
    });
    await consumerB.subscribe(SIMULATION_TOPICS.RUN('fast-markov'), async () => {
      bCount++;
    });

    for (let i = 0; i < 6; i++) {
      await producer.dispatch(
        SIMULATION_TOPICS.RUN('fast-markov'),
        runSimulationCommand(
          `aaaaaaaa-bbbb-4ccc-8ddd-${String(i).padStart(12, '0')}`,
          'fast-markov',
        ),
      );
    }
    await new Promise((r) => setTimeout(r, 2500));
    expect(aCount + bCount).toBe(6);
    expect(aCount).toBeGreaterThan(0);
    expect(bCount).toBeGreaterThan(0);
  }, 30_000);
});
```

- [ ] **Step 2: Run integration suite**

```bash
npx jest test/integration/distributed/per-profile-routing.spec.ts --runInBand
```
Expected: 2/2 PASS.

- [ ] **Step 3: Commit**

```bash
git add test/integration/distributed/per-profile-routing.spec.ts
git commit -m "test(integration/distributed): per-profile topic routing isolates and load-balances"
```

---

### Task 16: E2E test — profile param end-to-end

**Files:**
- Create: `test/e2e/profile-param.e2e-spec.ts`

- [ ] **Step 1: Write the test**

`test/e2e/profile-param.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from '../../src/app.module';

describe('POST /simulations { profile } (in-memory transport)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts request without profile (defaults to uniform-realtime)', async () => {
    const res = await request(app.getHttpServer())
      .post('/simulations')
      .send({ name: 'Default Profile Test' })
      .expect(201);
    expect(res.body.simulationId).toBeDefined();
  });

  it('accepts each known profile', async () => {
    for (const profile of ['uniform-realtime', 'poisson-accelerated', 'fast-markov']) {
      const res = await request(app.getHttpServer())
        .post('/simulations')
        .send({ name: `${profile} test`, profile })
        .expect(201);
      expect(res.body.simulationId).toBeDefined();
    }
  });

  it('rejects unknown profile with 400', async () => {
    await request(app.getHttpServer())
      .post('/simulations')
      .send({ name: 'Bad Profile Test', profile: 'mystery-profile' })
      .expect(400);
  });
});
```

> **Note on in-memory transport in E2E**: Default `TRANSPORT_MODE=inmemory` means orchestrator dispatches to a CommandBus that has no subscribers (since AppModule doesn't include WorkerModule). The simulations don't actually run. The test only verifies API surface — DTO validation, profile routing, response shape. End-to-end execution is covered by the manual smoke test in Task 14 against a running compose.

- [ ] **Step 2: Run E2E**

```bash
npx jest test/e2e/profile-param.e2e-spec.ts --runInBand
```
Expected: 3/3 PASS.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/profile-param.e2e-spec.ts
git commit -m "test(e2e): POST /simulations profile field — defaults, valid values, validation"
```

---

### Task 17: README — Phase 3 status + profile usage

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update Phase status section**

In `README.md`, find the Phase status section (probably "## Status" or similar) and add Phase 3 entry:
```markdown
- ✅ **Phase 3 — Profile-driven specialization** (`v3.0-profile-driven`)
  - 3 profile w `PROFILES` registry: `uniform-realtime`, `poisson-accelerated`, `fast-markov`
  - `POST /simulations { name, profile? }` — Zod whitelist validation
  - Worker selection via `SIMULATION_PROFILE` env (jeden image, N replik per profile)
  - docker-compose: `worker-uniform` ×2, `worker-poisson` ×1, `worker-markov` ×1
  - ADR-002 (config split), ADR-003 (registry), ADR-004 (topic routing), ADR-005 (clock semantics)
```

- [ ] **Step 2: Add a "Profiles" subsection in Usage**

Find the "Running locally" / "Usage" section and add:
```markdown
### Profiles

`POST /simulations` accepts an optional `profile` field selecting the dynamics + clock combo:

| Profile | Dynamics | Clock | Demo behaviour |
|---|---|---|---|
| `uniform-realtime` (default) | UniformRandomGoal | SystemClock | 9 goals over 9s, fixed interval |
| `poisson-accelerated` | Poisson (mean 2.7/team) | AcceleratedClock(600×) | 90-min match compressed to ~9s, realistic variance |
| `fast-markov` | FastMarkov (state machine) | AcceleratedClock(1000×) | event-driven match progression |

```bash
curl -X POST http://localhost:3000/simulations \
  -H 'Content-Type: application/json' \
  -d '{"name": "Katar 2023", "profile": "poisson-accelerated"}'
```

To scale workers per profile:
```bash
docker compose scale worker-poisson=5
```
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README Phase 3 status + profile usage examples + scale-per-profile snippet"
```

---

### Task 18: CHANGELOG [3.0.0]

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add 3.0.0 entry at top**

In `CHANGELOG.md`, insert a new section above `[2.0.0]`:
```markdown
## [3.0.0] — 2026-04-19 — Phase 3: Profile-driven specialization

### Added
- 3 profile uruchomieniowe: `uniform-realtime` (default), `poisson-accelerated`, `fast-markov`
- `Profile` interface + const `PROFILES` registry w `src/simulation/infrastructure/profiles/`
- `PoissonGoalDynamics` — per-team Poisson process, exponential inter-arrival sampling
- `FastMarkovDynamics` — Markov chain over match states with goal-only intent emission
- `AcceleratedClock` — wraps any `Clock`, dzieli `sleep(ms)` przez factor; `now()` zwraca real time
- `RandomProvider.float(): number` (port extension; impl w Crypto + Seeded)
- `POST /simulations` przyjmuje opcjonalny `profile` (Zod whitelist)
- `SIMULATION_PROFILE` env var (config schema)
- docker-compose: `worker-uniform` (×2), `worker-poisson` (×1), `worker-markov` (×1)
- Integration test: per-profile topic routing (Testcontainers)
- E2E test: profile param defaults / acceptance / rejection

### Changed
- **Breaking**: `SimulationConfig` interface usunięty. Zastąpiony przez:
  - `CoreSimulationConfig { durationMs }` (advisory)
  - per-dynamics config interfaces (`UniformDynamicsConfig`, `PoissonDynamicsConfig`, `MarkovDynamicsConfig`) embedded w klasach
- `SimulationOrchestrator` deps: `config: SimulationConfig` → `cooldownMs: number`
- `WorkerModule`: hardcoded profile → env-driven via `SIMULATION_PROFILE` + registry lookup

### ADRs
- ADR-002: SimulationConfig split into core + per-dynamics
- ADR-003: Profile registry as const map
- ADR-004: Per-profile topic routing `simulation.run.{profileId}`
- ADR-005: AcceleratedClock semantics (real timestamps, virtual scheduling)

### Notes
- Profile bez workera = lazy/pending (job czeka w queue). Phase 6 doda proper readiness gate (503).
- RichEventDynamics ODROCZONE do Phase 5 (rich domain events).
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG [3.0.0] — Phase 3 profile-driven specialization"
```

---

### Task 19: simplify (post-implementation review)

- [ ] **Step 1: Run simplify skill against Phase 3 changes**

Invoke skill `simplify` over `git diff main..HEAD` covering all Phase 3 commits. Look for:
- Code reuse (does any new dynamics code reimplement utilities already in random/time?)
- Unnecessary state (Markov state Map: is per-tick reset detection robust?)
- Efficient profile lookup (registry uses `Object.freeze` + Map alternative?)
- Comments/dead code

- [ ] **Step 2: Apply fixes from simplify; commit per fix**

Each fix as separate commit. If nothing found, note "simplify clean" in commit body of next item.

---

### Task 20: Security review

- [ ] **Step 1: Run feature-dev:code-reviewer with security focus**

Review entire Phase 3 diff for:
- Injection: profile id from user → topic name. Verify Zod whitelist prevents arbitrary topic creation
- DoS: profile that takes forever (e.g., misconfigured Poisson with λ=0). Verify durationMs cap enforced
- State leak: Poisson/Markov state Map — does abort path cleanup state? (Phase 5 graceful shutdown will harden — note as known)
- Random source for security-sensitive ops: GoalScored intents use random.int, not crypto-bound — fine

- [ ] **Step 2: Apply fixes; commit per fix**

---

### Task 21: Tag v3.0-profile-driven

- [ ] **Step 1: Verify all tests pass**

```bash
npx jest --silent
```
Expected: all green.

- [ ] **Step 2: Verify build**

```bash
npx tsc -p tsconfig.build.json --noEmit
```
Expected: no errors.

- [ ] **Step 3: Tag**

```bash
git tag -a v3.0-profile-driven -m "Phase 3: Profile-driven specialization"
git log --oneline -1
```

- [ ] **Step 4: STOP — push (user-only operation)**

The push of branch + tag is a user-only step (per repo workflow). When implementation is done, stop and instruct user:
```
git push -u origin phase-3-profile-driven
git push origin v3.0-profile-driven
```
Then merge phase-3 → main using the same flow as Phase 2 (see prior session).

---

## Self-Review

After writing the plan above, verifying against spec §9 Phase 3:

1. **Spec coverage**:
   - ✅ "Nowe `MatchDynamics`: PoissonGoalDynamics, FastMarkovDynamics, RichEventDynamics" — Poisson + Markov done; RichEvent explicitly deferred to Phase 5 (D1)
   - ✅ "Nowe `Clock`: AcceleratedClock(factor), FixedStepClock" — AcceleratedClock done; FixedStepClock deferred to Phase 5 (replay) per D9 in brainstorm
   - ✅ "Profile registry" — Task 9
   - ✅ "Worker wiring via env" — Task 13
   - ✅ "API: POST /simulations { profile?: string } + Zod whitelist" — Task 11
   - ✅ "docker-compose: per-profile worker replica counts" — Task 14
   - ✅ "Testy: nowe testy dla każdego dynamics, profile routing test" — Tasks 6, 7, 15

2. **Placeholder scan**: every code block contains complete code. Test fixtures concrete. Commands explicit. No "TBD" / "implement later" / "etc."

3. **Type consistency**:
   - `CoreSimulationConfig` consistently `{ durationMs: number }`
   - `Profile.coreConfig`, `Profile.dynamicsFactory`, `Profile.clockFactory` consistent across all 3 profile files
   - `PROFILE_IDS` array consistently typed as `readonly string[]`
   - `getProfile(id)` consistently throws on unknown
   - `SimulationOrchestrator.cooldownMs: number` consistently primitive

4. **Order dependencies verified**:
   - Task 5 (`float()`) before Task 6 (Poisson uses float)
   - Task 2 (config split) before Task 6/7 (dynamics use new core config)
   - Task 9 (registry) before Task 11 (DTO imports PROFILE_IDS)
   - Task 9 before Task 13 (WorkerModule uses getProfile)
   - Task 12 (env enum) before Task 13 (WorkerModule reads env)

Plan is internally consistent. Ready for execution.

---

## Execution Notes

**Branch strategy**: create `phase-3-profile-driven` from `main` (which now contains Phase 2 merge):
```bash
git checkout main
git pull
git checkout -b phase-3-profile-driven
```

**Subagent dispatch**: Each task above is sized for one fresh subagent (model: sonnet for mechanical impl, opus for ADR drafting if needed). Two-stage review per task (spec compliance, then code quality) per `superpowers:subagent-driven-development`.

**Final delivery**: tag `v3.0-profile-driven`, then merge to main using same flow as Phase 2 (separate branch `feature/dashboard-realtime` does not block — leave it alone, merge later).
