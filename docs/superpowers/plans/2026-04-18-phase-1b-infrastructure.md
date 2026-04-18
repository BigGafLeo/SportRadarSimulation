# Phase 1b — Infrastructure Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dostarczyć wszystkie 12 adapterów (konkretnych implementacji) dla portów zdefiniowanych w Phase 1a: SystemClock + FakeClock, CryptoRandomProvider + SeededRandomProvider, InMemory repositories, UniformRandomGoalDynamics, TickingSimulationEngine, InMemoryCommandBus + InMemoryEventBus, retention + throttle + token generator policies. Delivery state: wszystkie unit testy adapterów zielone + integracyjny test pokazujący Engine + Dynamics + FakeClock generuje 9 goli w <100ms.

**Architecture:** Wszystkie adaptery żyją w `src/<context>/infrastructure/` (simulation + ownership + shared). Adaptery zawierają jedynie logikę "jak" (implementację) — logika "co" (invarianty, stan) siedzi w domain. Dynamics nie mutuje aggregate; produkuje **intent event** (D.Event z placeholder fields, real event emituje aggregate gdy Engine dispatchuje via applyGoal). Engine tłumaczy intent → aggregate method call → pulls real event → emit callback. Testy integracyjne używają InMemoryRepos + FakeClock + SeededRandomProvider → 9-sekundowa symulacja wykonuje się w <100ms.

**Tech Stack:** TypeScript 5.x strict, Zod 3.x (dla SimulationConfig validation w bootstrap), Node `crypto` module (randomUUID + randomInt), Node `EventEmitter` (in-memory bus), Jest + ts-jest.

**Spec reference:** `docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md` §6 (Ports & Adapters catalog), §7 (Message bus), §10 (Testing strategy).

**Phase 1a state (input):** 68 unit tests green. 12 port signatures defined. `Simulation` aggregate with state machine + invariants. All VOs immutable with Zod validation.

---

## Key design decision for Phase 1b (ADR-001)

**MatchDynamics.nextStep returns `{delayMs, event: DomainEvent}` where `event` is an INTENT**, not the final emitted event. Engine discriminates on `event.type`, calls the corresponding aggregate mutation method, and forwards aggregate's real emitted events via `emit` callback. Placeholder fields in intent (score snapshot, totalGoals, occurredAt) are ignored by Engine.

**Why this design:**
- Keeps Dynamics pure (no aggregate mutation)
- Dynamics doesn't need Clock (Engine supplies `now`)
- Aggregate remains single source of invariant enforcement
- Port signature from Phase 1a is preserved (no breaking change)

**Consequences:**
- Engine has small switch on event type (currently only `GoalScored`, Phase 3+ adds cards/injuries)
- Dynamics constructs events with dummy `score: []`, `totalGoals: 0`, `occurredAt: new Date(0)` for fields engine ignores
- An ADR documents this so Phase 3 authors understand the pattern

This plan includes creating ADR-001 as Task 14.

---

## File structure (Phase 1b creates)

```
src/simulation/
├── domain/
│   └── simulation-config.ts           (new — domain type for timing config)
├── infrastructure/
│   ├── time/
│   │   ├── system-clock.ts            (new — impl Clock for production)
│   │   └── fake-clock.ts              (new — impl Clock for tests, exported)
│   ├── random/
│   │   ├── crypto-random-provider.ts  (new — impl RandomProvider via node:crypto)
│   │   └── seeded-random-provider.ts  (new — impl RandomProvider for tests, LCG)
│   ├── persistence/
│   │   └── in-memory-simulation.repository.ts
│   ├── dynamics/
│   │   └── uniform-random-goal-dynamics.ts
│   ├── engine/
│   │   └── ticking-simulation-engine.ts
│   └── policies/
│       ├── ttl-retention.policy.ts
│       └── five-second-cooldown.policy.ts

src/ownership/infrastructure/
├── uuid-ownership-token.generator.ts   (new)
└── in-memory-ownership.repository.ts   (new)

src/shared/messaging/
├── in-memory-command-bus.ts            (new)
├── in-memory-event-bus.ts              (new)
└── in-memory-event-publisher.ts        (new — wraps EventBus)

test/unit/infrastructure/
├── time/
│   ├── system-clock.spec.ts
│   └── fake-clock.spec.ts
├── random/
│   ├── crypto-random-provider.spec.ts
│   └── seeded-random-provider.spec.ts
├── persistence/
│   ├── in-memory-simulation.repository.spec.ts
│   └── in-memory-ownership.repository.spec.ts
├── dynamics/
│   └── uniform-random-goal-dynamics.spec.ts
├── engine/
│   └── ticking-simulation-engine.spec.ts
├── policies/
│   ├── ttl-retention.policy.spec.ts
│   └── five-second-cooldown.policy.spec.ts
└── messaging/
    ├── in-memory-command-bus.spec.ts
    ├── in-memory-event-bus.spec.ts
    └── in-memory-event-publisher.spec.ts

test/integration/
└── simulation-engine-end-to-end.spec.ts (new — full 9-goal flow in <100ms)

docs/decisions/
└── 001-match-dynamics-intent-pattern.md  (new ADR)
```

Deletes:
- `src/simulation/infrastructure/.gitkeep` (replaced by subdirs)
- `src/ownership/infrastructure/.gitkeep`

---

## Task 1: SystemClock + FakeClock

**Files:**
- Create: `src/simulation/infrastructure/time/system-clock.ts`
- Create: `src/simulation/infrastructure/time/fake-clock.ts`
- Create: `test/unit/infrastructure/time/system-clock.spec.ts`
- Create: `test/unit/infrastructure/time/fake-clock.spec.ts`
- Delete: `src/simulation/infrastructure/.gitkeep` (replaced by subdir)

- [ ] **Step 1: Write failing tests for SystemClock**

`test/unit/infrastructure/time/system-clock.spec.ts`:
```typescript
import { SystemClock } from '@simulation/infrastructure/time/system-clock';

describe('SystemClock', () => {
  const clock = new SystemClock();

  it('now() returns a Date close to real wall clock', () => {
    const before = Date.now();
    const now = clock.now();
    const after = Date.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  it('sleep(0) resolves (almost) immediately', async () => {
    const start = Date.now();
    await clock.sleep(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('sleep(30) waits at least ~30ms', async () => {
    const start = Date.now();
    await clock.sleep(30);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(25); // allow timer slack
  });

  it('sleep rejects when signal is already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort(new Error('aborted pre-sleep'));
    await expect(clock.sleep(100, ctrl.signal)).rejects.toThrow('aborted pre-sleep');
  });

  it('sleep rejects when signal aborts mid-wait', async () => {
    const ctrl = new AbortController();
    const sleepPromise = clock.sleep(1000, ctrl.signal);
    setTimeout(() => ctrl.abort(new Error('mid-abort')), 10);
    await expect(sleepPromise).rejects.toThrow('mid-abort');
  });
});
```

- [ ] **Step 2: Run test, verify fails**

```bash
npm test -- system-clock.spec
```
Expected: module not found.

- [ ] **Step 3: Implement SystemClock**

`src/simulation/infrastructure/time/system-clock.ts`:
```typescript
import type { Clock } from '@simulation/domain/ports/clock.port';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(signal?.reason);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
```

- [ ] **Step 4: Run test, verify pass**

```bash
npm test -- system-clock.spec
```
Expected: 5 PASS.

- [ ] **Step 5: Write failing tests for FakeClock**

`test/unit/infrastructure/time/fake-clock.spec.ts`:
```typescript
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';

describe('FakeClock', () => {
  it('now() returns initial time until advanced', () => {
    const clock = new FakeClock(new Date('2026-01-01T00:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('advance(ms) moves now forward', async () => {
    const clock = new FakeClock(new Date('2026-01-01T00:00:00Z'));
    await clock.advance(1500);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:01.500Z');
  });

  it('sleep pending resolves when advance passes its deadline', async () => {
    const clock = new FakeClock(new Date(0));
    let resolved = false;
    const promise = clock.sleep(100).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    await clock.advance(50);
    expect(resolved).toBe(false);
    await clock.advance(50);
    await promise;
    expect(resolved).toBe(true);
  });

  it('multiple sleeps resolve in deadline order', async () => {
    const clock = new FakeClock(new Date(0));
    const order: number[] = [];
    const p1 = clock.sleep(200).then(() => order.push(1));
    const p2 = clock.sleep(100).then(() => order.push(2));
    const p3 = clock.sleep(300).then(() => order.push(3));
    await clock.advance(300);
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([2, 1, 3]);
  });

  it('sleep rejects when signal aborts', async () => {
    const clock = new FakeClock(new Date(0));
    const ctrl = new AbortController();
    const sleepPromise = clock.sleep(100, ctrl.signal);
    ctrl.abort(new Error('abort-fake'));
    await expect(sleepPromise).rejects.toThrow('abort-fake');
  });

  it('sleep rejects when signal already aborted', async () => {
    const clock = new FakeClock(new Date(0));
    const ctrl = new AbortController();
    ctrl.abort(new Error('pre-aborted'));
    await expect(clock.sleep(100, ctrl.signal)).rejects.toThrow('pre-aborted');
  });
});
```

- [ ] **Step 6: Implement FakeClock**

`src/simulation/infrastructure/time/fake-clock.ts`:
```typescript
import type { Clock } from '@simulation/domain/ports/clock.port';

interface PendingSleep {
  readonly resolveAt: number;
  resolve(): void;
  reject(reason: unknown): void;
}

/**
 * Deterministic Clock for tests. Call advance(ms) to move time forward and
 * resolve pending sleeps whose deadline is <= new time.
 */
export class FakeClock implements Clock {
  private current: Date;
  private pending: PendingSleep[] = [];

  constructor(initial: Date = new Date(0)) {
    this.current = new Date(initial.getTime());
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const entry: PendingSleep = {
        resolveAt: this.current.getTime() + ms,
        resolve,
        reject,
      };
      this.pending.push(entry);
      signal?.addEventListener(
        'abort',
        () => {
          this.pending = this.pending.filter((e) => e !== entry);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  }

  async advance(ms: number): Promise<void> {
    const targetTime = this.current.getTime() + ms;
    // Drain pending sleeps in deadline order.
    // Each resolved sleep may schedule microtasks that register new sleeps,
    // so we loop until no eligible entry remains.
    while (true) {
      const eligible = this.pending
        .filter((e) => e.resolveAt <= targetTime)
        .sort((a, b) => a.resolveAt - b.resolveAt);
      if (eligible.length === 0) break;
      const next = eligible[0];
      this.current = new Date(next.resolveAt);
      this.pending = this.pending.filter((e) => e !== next);
      next.resolve();
      // yield to microtasks so awaited code can register follow-up sleeps
      await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
      });
    }
    this.current = new Date(targetTime);
  }
}
```

- [ ] **Step 7: Run tests, commit**

```bash
npm test -- time/
npm run lint && npx tsc --noEmit
rm src/simulation/infrastructure/.gitkeep
git add src/simulation/infrastructure/time/ test/unit/infrastructure/time/
git add -u src/simulation/infrastructure/.gitkeep
git commit -m "feat(infra): SystemClock + FakeClock

- SystemClock: real setTimeout-backed sleep with AbortSignal handling
- FakeClock: deterministic advance(ms) resolves pending sleeps in deadline order
- 11 unit tests covering basic timing, abort signals, and ordering"
```

---

## Task 2: CryptoRandomProvider + SeededRandomProvider

**Files:**
- Create: `src/simulation/infrastructure/random/crypto-random-provider.ts`
- Create: `src/simulation/infrastructure/random/seeded-random-provider.ts`
- Create: `test/unit/infrastructure/random/crypto-random-provider.spec.ts`
- Create: `test/unit/infrastructure/random/seeded-random-provider.spec.ts`

- [ ] **Step 1: Failing tests for CryptoRandomProvider**

`test/unit/infrastructure/random/crypto-random-provider.spec.ts`:
```typescript
import { CryptoRandomProvider } from '@simulation/infrastructure/random/crypto-random-provider';

describe('CryptoRandomProvider', () => {
  const rng = new CryptoRandomProvider();

  it('int(0, 5) returns inclusive range values', () => {
    const samples = Array.from({ length: 200 }, () => rng.int(0, 5));
    expect(samples.every((v) => v >= 0 && v <= 5 && Number.isInteger(v))).toBe(true);
    expect(new Set(samples).size).toBeGreaterThan(1); // should be distribution, not constant
  });

  it('int(min, min) always returns min', () => {
    for (let i = 0; i < 20; i++) {
      expect(rng.int(7, 7)).toBe(7);
    }
  });

  it('uuid() returns a UUID v4 string', () => {
    const u = rng.uuid();
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('uuid() returns distinct values across calls', () => {
    const a = rng.uuid();
    const b = rng.uuid();
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Implement CryptoRandomProvider**

`src/simulation/infrastructure/random/crypto-random-provider.ts`:
```typescript
import { randomInt, randomUUID } from 'node:crypto';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';

export class CryptoRandomProvider implements RandomProvider {
  int(min: number, max: number): number {
    // randomInt(min, max) treats max as exclusive, so we pass max+1 for inclusive.
    return randomInt(min, max + 1);
  }

  uuid(): string {
    return randomUUID();
  }
}
```

- [ ] **Step 3: Run + verify**

```bash
npm test -- crypto-random-provider.spec
```
Expected: 4 tests PASS.

- [ ] **Step 4: Failing tests for SeededRandomProvider**

`test/unit/infrastructure/random/seeded-random-provider.spec.ts`:
```typescript
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';

describe('SeededRandomProvider', () => {
  it('produces the same sequence for the same seed (deterministic)', () => {
    const a = new SeededRandomProvider(42);
    const b = new SeededRandomProvider(42);
    const seqA = Array.from({ length: 10 }, () => a.int(0, 100));
    const seqB = Array.from({ length: 10 }, () => b.int(0, 100));
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new SeededRandomProvider(1);
    const b = new SeededRandomProvider(2);
    const seqA = Array.from({ length: 10 }, () => a.int(0, 100));
    const seqB = Array.from({ length: 10 }, () => b.int(0, 100));
    expect(seqA).not.toEqual(seqB);
  });

  it('int values are within inclusive range', () => {
    const rng = new SeededRandomProvider(7);
    const samples = Array.from({ length: 100 }, () => rng.int(-3, 3));
    expect(samples.every((v) => v >= -3 && v <= 3 && Number.isInteger(v))).toBe(true);
  });

  it('uuid() is deterministic per seeded instance', () => {
    const a = new SeededRandomProvider(5);
    const b = new SeededRandomProvider(5);
    expect(a.uuid()).toBe(b.uuid());
    expect(a.uuid()).toBe(b.uuid());
  });

  it('uuid() returns well-formed UUID v4 strings', () => {
    const rng = new SeededRandomProvider(5);
    const u = rng.uuid();
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
```

- [ ] **Step 5: Implement SeededRandomProvider (LCG)**

`src/simulation/infrastructure/random/seeded-random-provider.ts`:
```typescript
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';

/**
 * Linear Congruential Generator (Numerical Recipes parameters).
 * Not cryptographically secure; suitable for deterministic tests only.
 */
export class SeededRandomProvider implements RandomProvider {
  private state: number;

  constructor(seed: number) {
    // Coerce to unsigned 32-bit; guard against zero-state stall.
    this.state = (seed >>> 0) || 1;
  }

  int(min: number, max: number): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    const range = max - min + 1;
    return min + (this.state % range);
  }

  uuid(): string {
    // Build a synthetic UUID v4 from 4 seeded 32-bit draws.
    const parts = [this.nextHex(8), this.nextHex(4), '4' + this.nextHex(3), this.variantNibble() + this.nextHex(3), this.nextHex(12)];
    return parts.join('-');
  }

  private nextHex(digits: number): string {
    let out = '';
    while (out.length < digits) {
      this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
      out += this.state.toString(16).padStart(8, '0');
    }
    return out.slice(0, digits);
  }

  private variantNibble(): string {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    const variantBits = 0x8 | (this.state & 0x3); // 10xx
    return variantBits.toString(16);
  }
}
```

- [ ] **Step 6: Run + commit**

```bash
npm test -- random/
npm run lint && npx tsc --noEmit
git add src/simulation/infrastructure/random/ test/unit/infrastructure/random/
git commit -m "feat(infra): CryptoRandomProvider + SeededRandomProvider

- CryptoRandomProvider: Node crypto.randomInt inclusive + crypto.randomUUID
- SeededRandomProvider: LCG for deterministic tests; synthetic UUID v4 from seeded draws
- 9 unit tests covering range, determinism, UUID format"
```

---

## Task 3: InMemorySimulationRepository

**Files:**
- Create: `src/simulation/infrastructure/persistence/in-memory-simulation.repository.ts`
- Create: `test/unit/infrastructure/persistence/in-memory-simulation.repository.spec.ts`

- [ ] **Step 1: Failing tests**

`test/unit/infrastructure/persistence/in-memory-simulation.repository.spec.ts`:
```typescript
import { InMemorySimulationRepository } from '@simulation/infrastructure/persistence/in-memory-simulation.repository';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';

function makeSim(idStr: string, tokenStr: string): Simulation {
  return Simulation.create({
    id: SimulationId.create(idStr),
    ownerToken: OwnershipToken.create(tokenStr),
    name: SimulationName.create('Katar 2023'),
    matches: PRESET_MATCHES,
    profileId: 'default',
    now: new Date('2026-04-18T12:00:00Z'),
  });
}

describe('InMemorySimulationRepository', () => {
  const id1 = '550e8400-e29b-41d4-a716-446655440000';
  const id2 = '550e8400-e29b-41d4-a716-446655440002';
  const tokenA = '550e8400-e29b-41d4-a716-446655440010';
  const tokenB = '550e8400-e29b-41d4-a716-446655440011';

  it('findById returns null when not saved', async () => {
    const repo = new InMemorySimulationRepository();
    const result = await repo.findById(SimulationId.create(id1));
    expect(result).toBeNull();
  });

  it('save + findById round-trip', async () => {
    const repo = new InMemorySimulationRepository();
    const sim = makeSim(id1, tokenA);
    await repo.save(sim);
    const found = await repo.findById(SimulationId.create(id1));
    expect(found?.id.value).toBe(id1);
  });

  it('save overwrites existing by id', async () => {
    const repo = new InMemorySimulationRepository();
    const first = makeSim(id1, tokenA);
    await repo.save(first);
    const second = makeSim(id1, tokenA);
    await repo.save(second);
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
  });

  it('findAll returns all saved simulations', async () => {
    const repo = new InMemorySimulationRepository();
    await repo.save(makeSim(id1, tokenA));
    await repo.save(makeSim(id2, tokenB));
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.id.value).sort()).toEqual([id1, id2].sort());
  });

  it('findByOwner filters by ownerToken', async () => {
    const repo = new InMemorySimulationRepository();
    await repo.save(makeSim(id1, tokenA));
    await repo.save(makeSim(id2, tokenB));
    const byA = await repo.findByOwner(OwnershipToken.create(tokenA));
    expect(byA).toHaveLength(1);
    expect(byA[0].id.value).toBe(id1);
  });

  it('delete removes simulation', async () => {
    const repo = new InMemorySimulationRepository();
    await repo.save(makeSim(id1, tokenA));
    await repo.delete(SimulationId.create(id1));
    const found = await repo.findById(SimulationId.create(id1));
    expect(found).toBeNull();
  });

  it('delete is idempotent when id absent', async () => {
    const repo = new InMemorySimulationRepository();
    await expect(repo.delete(SimulationId.create(id1))).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Implement**

`src/simulation/infrastructure/persistence/in-memory-simulation.repository.ts`:
```typescript
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import type { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';

export class InMemorySimulationRepository implements SimulationRepository {
  private readonly store = new Map<string, Simulation>();

  async save(simulation: Simulation): Promise<void> {
    this.store.set(simulation.id.value, simulation);
  }

  async findById(id: SimulationId): Promise<Simulation | null> {
    return this.store.get(id.value) ?? null;
  }

  async findAll(): Promise<readonly Simulation[]> {
    return Array.from(this.store.values());
  }

  async findByOwner(token: OwnershipToken): Promise<readonly Simulation[]> {
    return Array.from(this.store.values()).filter((s) => s.ownerToken.equals(token));
  }

  async delete(id: SimulationId): Promise<void> {
    this.store.delete(id.value);
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- in-memory-simulation.repository.spec
npm run lint && npx tsc --noEmit
git add src/simulation/infrastructure/persistence/ test/unit/infrastructure/persistence/
git commit -m "feat(infra): InMemorySimulationRepository

- Map-backed implementation of SimulationRepository port
- save/findById/findAll/findByOwner/delete — 7 unit tests"
```

---

## Task 4: InMemoryOwnershipRepository

**Files:**
- Create: `src/ownership/infrastructure/in-memory-ownership.repository.ts`
- Create: `test/unit/infrastructure/persistence/in-memory-ownership.repository.spec.ts`
- Delete: `src/ownership/infrastructure/.gitkeep`

- [ ] **Step 1: Failing tests**

`test/unit/infrastructure/persistence/in-memory-ownership.repository.spec.ts`:
```typescript
import { InMemoryOwnershipRepository } from '@ownership/infrastructure/in-memory-ownership.repository';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';

describe('InMemoryOwnershipRepository', () => {
  const tokenStr = '550e8400-e29b-41d4-a716-446655440010';
  const token = OwnershipToken.create(tokenStr);

  it('findByToken returns null when not saved', async () => {
    const repo = new InMemoryOwnershipRepository();
    const r = await repo.findByToken(token);
    expect(r).toBeNull();
  });

  it('save + findByToken round-trip', async () => {
    const repo = new InMemoryOwnershipRepository();
    const createdAt = new Date('2026-04-18T10:00:00Z');
    await repo.save({ token, createdAt, lastIgnitionAt: null });
    const r = await repo.findByToken(token);
    expect(r?.token.value).toBe(tokenStr);
    expect(r?.createdAt).toEqual(createdAt);
    expect(r?.lastIgnitionAt).toBeNull();
  });

  it('updateLastIgnitionAt updates the stored timestamp', async () => {
    const repo = new InMemoryOwnershipRepository();
    await repo.save({ token, createdAt: new Date(0), lastIgnitionAt: null });
    const ignitionAt = new Date('2026-04-18T10:00:00Z');
    await repo.updateLastIgnitionAt(token, ignitionAt);
    const r = await repo.findByToken(token);
    expect(r?.lastIgnitionAt).toEqual(ignitionAt);
  });

  it('updateLastIgnitionAt throws if token unknown', async () => {
    const repo = new InMemoryOwnershipRepository();
    await expect(repo.updateLastIgnitionAt(token, new Date())).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Implement**

`src/ownership/infrastructure/in-memory-ownership.repository.ts`:
```typescript
import type {
  OwnershipRecord,
  OwnershipRepository,
} from '@ownership/domain/ports/ownership-repository.port';
import type { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';

export class InMemoryOwnershipRepository implements OwnershipRepository {
  private readonly store = new Map<string, OwnershipRecord>();

  async save(record: OwnershipRecord): Promise<void> {
    this.store.set(record.token.value, { ...record });
  }

  async findByToken(token: OwnershipToken): Promise<OwnershipRecord | null> {
    return this.store.get(token.value) ?? null;
  }

  async updateLastIgnitionAt(token: OwnershipToken, now: Date): Promise<void> {
    const existing = this.store.get(token.value);
    if (!existing) {
      throw new Error(`OwnershipToken not found: ${token.value}`);
    }
    this.store.set(token.value, { ...existing, lastIgnitionAt: now });
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- in-memory-ownership.repository.spec
npm run lint && npx tsc --noEmit
rm src/ownership/infrastructure/.gitkeep
git add src/ownership/infrastructure/ test/unit/infrastructure/persistence/in-memory-ownership.repository.spec.ts
git add -u src/ownership/infrastructure/.gitkeep
git commit -m "feat(infra): InMemoryOwnershipRepository

- save/findByToken/updateLastIgnitionAt implementation
- updateLastIgnitionAt throws on unknown token (defensive)
- 4 unit tests"
```

---

## Task 5: UuidOwnershipTokenGenerator

**Files:**
- Create: `src/ownership/infrastructure/uuid-ownership-token.generator.ts`
- Create: `test/unit/infrastructure/persistence/uuid-ownership-token.generator.spec.ts`

- [ ] **Step 1: Failing tests**

`test/unit/infrastructure/persistence/uuid-ownership-token.generator.spec.ts`:
```typescript
import { UuidOwnershipTokenGenerator } from '@ownership/infrastructure/uuid-ownership-token.generator';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { CryptoRandomProvider } from '@simulation/infrastructure/random/crypto-random-provider';

describe('UuidOwnershipTokenGenerator', () => {
  it('produces OwnershipToken wrapping a UUID v4', () => {
    const gen = new UuidOwnershipTokenGenerator(new CryptoRandomProvider());
    const token = gen.generate();
    expect(token.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('different calls return distinct tokens', () => {
    const gen = new UuidOwnershipTokenGenerator(new CryptoRandomProvider());
    expect(gen.generate().value).not.toBe(gen.generate().value);
  });

  it('using SeededRandomProvider makes generate deterministic', () => {
    const a = new UuidOwnershipTokenGenerator(new SeededRandomProvider(42));
    const b = new UuidOwnershipTokenGenerator(new SeededRandomProvider(42));
    expect(a.generate().value).toBe(b.generate().value);
  });
});
```

- [ ] **Step 2: Implement**

`src/ownership/infrastructure/uuid-ownership-token.generator.ts`:
```typescript
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import type { OwnershipTokenGenerator } from '@ownership/domain/ports/ownership-token-generator.port';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';

export class UuidOwnershipTokenGenerator implements OwnershipTokenGenerator {
  constructor(private readonly random: RandomProvider) {}

  generate(): OwnershipToken {
    return OwnershipToken.create(this.random.uuid());
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- uuid-ownership-token.generator.spec
npm run lint && npx tsc --noEmit
git add src/ownership/infrastructure/uuid-ownership-token.generator.ts test/unit/infrastructure/persistence/uuid-ownership-token.generator.spec.ts
git commit -m "feat(infra): UuidOwnershipTokenGenerator

- Delegates to RandomProvider.uuid() and wraps result in OwnershipToken VO
- 3 tests covering format, uniqueness (crypto), and determinism (seeded)"
```

---

## Task 6: FiveSecondCooldownPolicy

**Files:**
- Create: `src/simulation/infrastructure/policies/five-second-cooldown.policy.ts`
- Create: `test/unit/infrastructure/policies/five-second-cooldown.policy.spec.ts`

- [ ] **Step 1: Failing tests**

`test/unit/infrastructure/policies/five-second-cooldown.policy.spec.ts`:
```typescript
import { FiveSecondCooldownPolicy } from '@simulation/infrastructure/policies/five-second-cooldown.policy';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';

describe('FiveSecondCooldownPolicy', () => {
  const token = OwnershipToken.create('550e8400-e29b-41d4-a716-446655440010');
  const policy = new FiveSecondCooldownPolicy(5000);

  it('allows ignition when lastIgnitionAt is null', () => {
    expect(policy.canIgnite(token, null, new Date())).toBe(true);
  });

  it('blocks ignition within cooldown window', () => {
    const last = new Date('2026-04-18T12:00:00Z');
    const now = new Date('2026-04-18T12:00:04Z'); // +4s
    expect(policy.canIgnite(token, last, now)).toBe(false);
  });

  it('allows ignition at exact cooldown boundary', () => {
    const last = new Date('2026-04-18T12:00:00Z');
    const now = new Date('2026-04-18T12:00:05Z'); // +5s exactly
    expect(policy.canIgnite(token, last, now)).toBe(true);
  });

  it('allows ignition well after cooldown', () => {
    const last = new Date('2026-04-18T12:00:00Z');
    const now = new Date('2026-04-18T12:01:00Z');
    expect(policy.canIgnite(token, last, now)).toBe(true);
  });

  it('respects custom cooldown value', () => {
    const shortPolicy = new FiveSecondCooldownPolicy(1000);
    const last = new Date('2026-04-18T12:00:00Z');
    const now = new Date('2026-04-18T12:00:00.999Z');
    expect(shortPolicy.canIgnite(token, last, now)).toBe(false);
    const now2 = new Date('2026-04-18T12:00:01Z');
    expect(shortPolicy.canIgnite(token, last, now2)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

`src/simulation/infrastructure/policies/five-second-cooldown.policy.ts`:
```typescript
import type { ThrottlePolicy } from '@simulation/domain/ports/throttle-policy.port';
import type { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';

export class FiveSecondCooldownPolicy implements ThrottlePolicy {
  /**
   * @param cooldownMs defaults to 5000ms per PDF requirement #3
   */
  constructor(private readonly cooldownMs: number = 5000) {}

  canIgnite(_token: OwnershipToken, lastIgnitionAt: Date | null, now: Date): boolean {
    if (lastIgnitionAt === null) return true;
    return now.getTime() - lastIgnitionAt.getTime() >= this.cooldownMs;
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- five-second-cooldown.policy.spec
npm run lint && npx tsc --noEmit
git add src/simulation/infrastructure/policies/five-second-cooldown.policy.ts test/unit/infrastructure/policies/five-second-cooldown.policy.spec.ts
git commit -m "feat(infra): FiveSecondCooldownPolicy

- Cooldown defaults to 5000ms (PDF req #3); configurable via constructor
- Boundary semantics: >= cooldownMs allowed (closed interval)
- 5 unit tests"
```

---

## Task 7: TtlRetentionPolicy

**Files:**
- Create: `src/simulation/infrastructure/policies/ttl-retention.policy.ts`
- Create: `test/unit/infrastructure/policies/ttl-retention.policy.spec.ts`

- [ ] **Step 1: Failing tests**

`test/unit/infrastructure/policies/ttl-retention.policy.spec.ts`:
```typescript
import { TtlRetentionPolicy } from '@simulation/infrastructure/policies/ttl-retention.policy';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';

function makeSim(startedAt: Date): Simulation {
  return Simulation.create({
    id: SimulationId.create('550e8400-e29b-41d4-a716-446655440000'),
    ownerToken: OwnershipToken.create('550e8400-e29b-41d4-a716-446655440010'),
    name: SimulationName.create('Katar 2023'),
    matches: PRESET_MATCHES,
    profileId: 'default',
    now: startedAt,
  });
}

describe('TtlRetentionPolicy', () => {
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const policy = new TtlRetentionPolicy(ONE_HOUR_MS);

  it('does not remove RUNNING simulation regardless of age', () => {
    const start = new Date('2026-04-18T10:00:00Z');
    const sim = makeSim(start);
    const muchLater = new Date(start.getTime() + 24 * ONE_HOUR_MS);
    expect(policy.shouldRemove(sim, muchLater)).toBe(false);
  });

  it('does not remove FINISHED sim younger than TTL', () => {
    const start = new Date('2026-04-18T10:00:00Z');
    const sim = makeSim(start);
    sim.finish('auto', new Date(start.getTime() + 9000)); // finished at +9s
    const check = new Date(start.getTime() + 30 * 60 * 1000); // +30min (within 1h TTL)
    expect(policy.shouldRemove(sim, check)).toBe(false);
  });

  it('removes FINISHED sim older than TTL', () => {
    const start = new Date('2026-04-18T10:00:00Z');
    const sim = makeSim(start);
    const finishedAt = new Date(start.getTime() + 9000);
    sim.finish('auto', finishedAt);
    const check = new Date(finishedAt.getTime() + ONE_HOUR_MS + 1);
    expect(policy.shouldRemove(sim, check)).toBe(true);
  });

  it('removes at exact TTL boundary', () => {
    const start = new Date('2026-04-18T10:00:00Z');
    const sim = makeSim(start);
    const finishedAt = new Date(start.getTime() + 9000);
    sim.finish('auto', finishedAt);
    const check = new Date(finishedAt.getTime() + ONE_HOUR_MS);
    expect(policy.shouldRemove(sim, check)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**

`src/simulation/infrastructure/policies/ttl-retention.policy.ts`:
```typescript
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { RetentionPolicy } from '@simulation/domain/ports/retention-policy.port';

export class TtlRetentionPolicy implements RetentionPolicy {
  /**
   * @param ttlMs time-to-live after finishedAt; sims older than this are GC eligible.
   */
  constructor(private readonly ttlMs: number) {}

  shouldRemove(simulation: Simulation, now: Date): boolean {
    const snap = simulation.toSnapshot();
    if (snap.state !== 'FINISHED' || snap.finishedAt === null) return false;
    return now.getTime() - snap.finishedAt.getTime() >= this.ttlMs;
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- ttl-retention.policy.spec
npm run lint && npx tsc --noEmit
git add src/simulation/infrastructure/policies/ttl-retention.policy.ts test/unit/infrastructure/policies/ttl-retention.policy.spec.ts
git commit -m "feat(infra): TtlRetentionPolicy

- Removes FINISHED sims whose age (now - finishedAt) >= ttlMs
- Protects RUNNING sims regardless of age
- 4 unit tests incl. boundary and not-yet-finished cases"
```

---

## Task 8: SimulationConfig type + UniformRandomGoalDynamics

**Files:**
- Create: `src/simulation/domain/simulation-config.ts`
- Create: `src/simulation/infrastructure/dynamics/uniform-random-goal-dynamics.ts`
- Create: `test/unit/infrastructure/dynamics/uniform-random-goal-dynamics.spec.ts`

- [ ] **Step 1: Create SimulationConfig type**

`src/simulation/domain/simulation-config.ts`:
```typescript
/**
 * Timing config for Engine + Dynamics. Mapped from env by config.schema.ts
 * at module wiring time. Lives in domain so Engine/Dynamics can depend
 * on it without reaching into infrastructure.
 */
export interface SimulationConfig {
  readonly durationMs: number;
  readonly goalIntervalMs: number;
  readonly goalCount: number;
  readonly firstGoalOffsetMs: number;
  readonly startCooldownMs: number;
}
```

- [ ] **Step 2: Failing tests**

`test/unit/infrastructure/dynamics/uniform-random-goal-dynamics.spec.ts`:
```typescript
import { UniformRandomGoalDynamics } from '@simulation/infrastructure/dynamics/uniform-random-goal-dynamics';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES, PRESET_TEAMS } from '@simulation/domain/value-objects/matches-preset';
import { GoalScored } from '@simulation/domain/events/goal-scored';

const DEFAULT_CONFIG = {
  durationMs: 9000,
  goalIntervalMs: 1000,
  goalCount: 9,
  firstGoalOffsetMs: 1000,
  startCooldownMs: 5000,
};

function makeSim(): Simulation {
  const sim = Simulation.create({
    id: SimulationId.create('550e8400-e29b-41d4-a716-446655440000'),
    ownerToken: OwnershipToken.create('550e8400-e29b-41d4-a716-446655440010'),
    name: SimulationName.create('Katar 2023'),
    matches: PRESET_MATCHES,
    profileId: 'default',
    now: new Date(0),
  });
  sim.pullEvents();
  return sim;
}

describe('UniformRandomGoalDynamics', () => {
  it('returns TimedEvent with firstGoalOffsetMs for tickIndex 0', async () => {
    const dyn = new UniformRandomGoalDynamics(new SeededRandomProvider(42), DEFAULT_CONFIG);
    const step = await dyn.nextStep(makeSim(), 0);
    expect(step).toBeDefined();
    expect(step!.delayMs).toBe(DEFAULT_CONFIG.firstGoalOffsetMs);
  });

  it('returns goalIntervalMs for tickIndex > 0', async () => {
    const dyn = new UniformRandomGoalDynamics(new SeededRandomProvider(42), DEFAULT_CONFIG);
    const step = await dyn.nextStep(makeSim(), 5);
    expect(step!.delayMs).toBe(DEFAULT_CONFIG.goalIntervalMs);
  });

  it('returns undefined once tickIndex reaches goalCount (natural end)', async () => {
    const dyn = new UniformRandomGoalDynamics(new SeededRandomProvider(42), DEFAULT_CONFIG);
    const step = await dyn.nextStep(makeSim(), DEFAULT_CONFIG.goalCount);
    expect(step).toBeUndefined();
  });

  it('event is GoalScored with teamId from PRESET_TEAMS', async () => {
    const dyn = new UniformRandomGoalDynamics(new SeededRandomProvider(42), DEFAULT_CONFIG);
    const step = await dyn.nextStep(makeSim(), 0);
    expect(step!.event).toBeInstanceOf(GoalScored);
    const e = step!.event as GoalScored;
    const validTeamIds = PRESET_TEAMS.map((t) => t.id.value);
    expect(validTeamIds).toContain(e.teamId.value);
  });

  it('with fixed seed, produces deterministic sequence of teamIds', async () => {
    const dynA = new UniformRandomGoalDynamics(new SeededRandomProvider(7), DEFAULT_CONFIG);
    const dynB = new UniformRandomGoalDynamics(new SeededRandomProvider(7), DEFAULT_CONFIG);
    const sim = makeSim();
    const seqA: string[] = [];
    const seqB: string[] = [];
    for (let i = 0; i < 9; i++) {
      const a = await dynA.nextStep(sim, i);
      const b = await dynB.nextStep(sim, i);
      seqA.push((a!.event as GoalScored).teamId.value);
      seqB.push((b!.event as GoalScored).teamId.value);
    }
    expect(seqA).toEqual(seqB);
  });

  it('distributes across all 6 PRESET_TEAMS over many samples', async () => {
    const dyn = new UniformRandomGoalDynamics(new SeededRandomProvider(99), DEFAULT_CONFIG);
    const sim = makeSim();
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const step = await dyn.nextStep(sim, i % DEFAULT_CONFIG.goalCount);
      if (step) seen.add((step.event as GoalScored).teamId.value);
    }
    expect(seen.size).toBe(PRESET_TEAMS.length);
  });
});
```

- [ ] **Step 3: Implement**

`src/simulation/infrastructure/dynamics/uniform-random-goal-dynamics.ts`:
```typescript
import type { MatchDynamics, TimedEvent } from '@simulation/domain/ports/match-dynamics.port';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { SimulationConfig } from '@simulation/domain/simulation-config';
import { GoalScored } from '@simulation/domain/events/goal-scored';
import { PRESET_TEAMS } from '@simulation/domain/value-objects/matches-preset';

/**
 * Produces "intent" events: the engine translates each GoalScored intent into
 * sim.applyGoal(teamId, now) and forwards the aggregate's real emitted event.
 * Placeholder fields (score, totalGoals, occurredAt) are ignored by engine.
 * See ADR-001.
 */
export class UniformRandomGoalDynamics implements MatchDynamics {
  constructor(
    private readonly random: RandomProvider,
    private readonly config: SimulationConfig,
  ) {}

  async nextStep(simulation: Simulation, tickIndex: number): Promise<TimedEvent | undefined> {
    if (tickIndex >= this.config.goalCount) return undefined;

    const teamIndex = this.random.int(0, PRESET_TEAMS.length - 1);
    const team = PRESET_TEAMS[teamIndex];

    const delayMs =
      tickIndex === 0 ? this.config.firstGoalOffsetMs : this.config.goalIntervalMs;

    // Placeholder fields — engine ignores them and re-emits via sim.applyGoal().
    const intent = new GoalScored(simulation.id, team.id, [], 0, new Date(0));

    return { delayMs, event: intent };
  }
}
```

- [ ] **Step 4: Run + commit**

```bash
npm test -- uniform-random-goal-dynamics.spec
npm run lint && npx tsc --noEmit
git add src/simulation/domain/simulation-config.ts src/simulation/infrastructure/dynamics/ test/unit/infrastructure/dynamics/
git commit -m "feat(infra): UniformRandomGoalDynamics + SimulationConfig type

- Dynamics returns intent GoalScored event (teamId chosen uniformly from 6 PRESET_TEAMS)
- firstGoalOffsetMs for first tick, goalIntervalMs thereafter; undefined at goalCount
- Placeholder event fields per ADR-001 (engine re-emits real event)
- 6 unit tests — timing, range, determinism, distribution"
```

---

## Task 9: TickingSimulationEngine + ADR-001

**Files:**
- Create: `src/simulation/infrastructure/engine/ticking-simulation-engine.ts`
- Create: `test/unit/infrastructure/engine/ticking-simulation-engine.spec.ts`
- Create: `docs/decisions/001-match-dynamics-intent-pattern.md`

- [ ] **Step 1: Create ADR-001**

`docs/decisions/001-match-dynamics-intent-pattern.md`:
```markdown
# ADR-001: MatchDynamics.nextStep.event is an intent, not the final emitted event

- **Status**: Accepted
- **Date**: 2026-04-18
- **Phase**: 1b

## Context

Phase 1a defined `MatchDynamics.nextStep(simulation, tickIndex): Promise<TimedEvent | undefined>` where `TimedEvent = { delayMs, event: DomainEvent }`. However, `DomainEvent` (specifically `GoalScored`) requires post-state fields (score snapshot, totalGoals, occurredAt) which Dynamics cannot know without mutating the aggregate — a responsibility we want to keep in the aggregate itself.

## Options considered

1. **Dynamics applies goals to aggregate** — simple but violates separation: Dynamics becomes a side-effect owner, not just a strategy.
2. **Port signature change** — redefine port to return `{ delayMs, intent: IntentDescriptor }`. Cleaner semantically but breaks Phase 1a port already committed and pushed.
3. **Dynamics returns intent events, Engine applies** — keep port as-is, interpret `event` as "what would happen", Engine dispatches on `event.type` to the appropriate aggregate method. Placeholder fields on intent are ignored.

## Decision

Option 3. `MatchDynamics` produces `TimedEvent` where `event` carries only the fields necessary to dispatch (e.g., `teamId` for `GoalScored`). Engine discriminates on `event.type`, calls the matching aggregate method, and emits the aggregate's real events via the `emit` callback.

## Consequences

- ✅ `MatchDynamics` remains pure (no aggregate mutation, no Clock dependency)
- ✅ Aggregate retains sole authority over invariants and final event construction
- ✅ Phase 1a port signature preserved — no rewrite needed
- ❌ Engine has a small switch on event type (currently one case: `GoalScored`). Phase 3 rich events add more cases.
- ❌ Intent events carry placeholder values for ignored fields — not elegant but localized to Dynamics implementations
- 🔄 Phase 3 (RichEventDynamics) must document the same pattern for new event types

## References

- Port definition: `src/simulation/domain/ports/match-dynamics.port.ts`
- First implementation: `src/simulation/infrastructure/dynamics/uniform-random-goal-dynamics.ts`
- Engine dispatch: `src/simulation/infrastructure/engine/ticking-simulation-engine.ts`
- Design spec §6.3 (original port definition)
```

- [ ] **Step 2: Failing tests for engine**

`test/unit/infrastructure/engine/ticking-simulation-engine.spec.ts`:
```typescript
import { TickingSimulationEngine } from '@simulation/infrastructure/engine/ticking-simulation-engine';
import { UniformRandomGoalDynamics } from '@simulation/infrastructure/dynamics/uniform-random-goal-dynamics';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import type { DomainEvent } from '@simulation/domain/events/domain-event';

const CONFIG = {
  durationMs: 9000,
  goalIntervalMs: 1000,
  goalCount: 9,
  firstGoalOffsetMs: 1000,
  startCooldownMs: 5000,
};

function makeSim(): Simulation {
  const sim = Simulation.create({
    id: SimulationId.create('550e8400-e29b-41d4-a716-446655440000'),
    ownerToken: OwnershipToken.create('550e8400-e29b-41d4-a716-446655440010'),
    name: SimulationName.create('Katar 2023'),
    matches: PRESET_MATCHES,
    profileId: 'default',
    now: new Date(0),
  });
  sim.pullEvents();
  return sim;
}

describe('TickingSimulationEngine', () => {
  it('runs dynamics to completion, emits 9 GoalScored + 1 SimulationFinished (auto)', async () => {
    const clock = new FakeClock(new Date(0));
    const dyn = new UniformRandomGoalDynamics(new SeededRandomProvider(42), CONFIG);
    const engine = new TickingSimulationEngine(clock, dyn);
    const sim = makeSim();
    const emitted: DomainEvent[] = [];

    const runPromise = engine.run(
      sim,
      async (e) => {
        emitted.push(e);
      },
      new AbortController().signal,
    );
    await clock.advance(10_000);
    await runPromise;

    const goalCount = emitted.filter((e) => e.type === 'GoalScored').length;
    const finishCount = emitted.filter((e) => e.type === 'SimulationFinished').length;
    expect(goalCount).toBe(9);
    expect(finishCount).toBe(1);

    // Last event should be SimulationFinished with reason 'auto'
    const last = emitted[emitted.length - 1];
    expect(last.type).toBe('SimulationFinished');
    if (last.type === 'SimulationFinished') {
      expect(last.reason).toBe('auto');
      expect(last.totalGoals).toBe(9);
    }
  });

  it('emitted GoalScored events carry post-increment totalGoals (1, 2, ..., 9)', async () => {
    const clock = new FakeClock(new Date(0));
    const dyn = new UniformRandomGoalDynamics(new SeededRandomProvider(42), CONFIG);
    const engine = new TickingSimulationEngine(clock, dyn);
    const sim = makeSim();
    const goals: number[] = [];

    const runPromise = engine.run(
      sim,
      async (e) => {
        if (e.type === 'GoalScored') goals.push(e.totalGoals);
      },
      new AbortController().signal,
    );
    await clock.advance(10_000);
    await runPromise;

    expect(goals).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('aborts cleanly when signal fires mid-run (no finish emitted)', async () => {
    const clock = new FakeClock(new Date(0));
    const dyn = new UniformRandomGoalDynamics(new SeededRandomProvider(42), CONFIG);
    const engine = new TickingSimulationEngine(clock, dyn);
    const sim = makeSim();
    const emitted: DomainEvent[] = [];
    const ctrl = new AbortController();

    const runPromise = engine.run(
      sim,
      async (e) => {
        emitted.push(e);
      },
      ctrl.signal,
    );
    await clock.advance(3000); // 3 goals in so far
    ctrl.abort();
    await expect(runPromise).resolves.toBeUndefined();

    const goalCount = emitted.filter((e) => e.type === 'GoalScored').length;
    const finishCount = emitted.filter((e) => e.type === 'SimulationFinished').length;
    expect(goalCount).toBe(3);
    expect(finishCount).toBe(0); // engine yields to orchestrator for 'manual' finish
  });

  it('does not run at all if aborted before start', async () => {
    const clock = new FakeClock(new Date(0));
    const dyn = new UniformRandomGoalDynamics(new SeededRandomProvider(42), CONFIG);
    const engine = new TickingSimulationEngine(clock, dyn);
    const sim = makeSim();
    const emitted: DomainEvent[] = [];
    const ctrl = new AbortController();
    ctrl.abort();

    await engine.run(
      sim,
      async (e) => {
        emitted.push(e);
      },
      ctrl.signal,
    );
    expect(emitted).toEqual([]);
  });
});
```

- [ ] **Step 3: Implement engine**

`src/simulation/infrastructure/engine/ticking-simulation-engine.ts`:
```typescript
import type { Clock } from '@simulation/domain/ports/clock.port';
import type { MatchDynamics } from '@simulation/domain/ports/match-dynamics.port';
import type { SimulationEngine } from '@simulation/domain/ports/simulation-engine.port';
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { DomainEvent } from '@simulation/domain/events/domain-event';

/**
 * Drives the simulation tick loop. For each tick:
 *   1. Ask dynamics for next intent + delay
 *   2. Sleep
 *   3. Dispatch intent to aggregate (applyGoal for GoalScored)
 *   4. Drain aggregate.pullEvents() through the emit callback
 * When dynamics returns undefined, engine calls sim.finish('auto') and drains.
 * On abort signal, engine returns without calling finish (orchestrator handles
 * the manual-finish flow).
 */
export class TickingSimulationEngine implements SimulationEngine {
  constructor(
    private readonly clock: Clock,
    private readonly dynamics: MatchDynamics,
  ) {}

  async run(
    simulation: Simulation,
    emit: (event: DomainEvent) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) return;

    for (let tick = 0; ; tick++) {
      if (signal.aborted) return;

      const step = await this.dynamics.nextStep(simulation, tick);
      if (!step) break;

      try {
        await this.clock.sleep(step.delayMs, signal);
      } catch {
        // signal aborted during sleep
        return;
      }
      if (signal.aborted) return;

      const now = this.clock.now();
      this.dispatchIntent(simulation, step.event, now);
      for (const evt of simulation.pullEvents()) {
        await emit(evt);
      }
    }

    // Natural end: auto-finish
    if (signal.aborted) return;
    simulation.finish('auto', this.clock.now());
    for (const evt of simulation.pullEvents()) {
      await emit(evt);
    }
  }

  private dispatchIntent(simulation: Simulation, intent: DomainEvent, now: Date): void {
    if (intent.type === 'GoalScored') {
      // See ADR-001: intent carries teamId; placeholder fields are ignored.
      simulation.applyGoal(intent.teamId, now);
      return;
    }
    // Phase 3+: add other intent types (YellowCardIssued, PlayerInjured, ...)
    throw new Error(`Unhandled intent event type: ${intent.type}`);
  }
}
```

- [ ] **Step 4: Run + commit**

```bash
npm test -- ticking-simulation-engine.spec
npm run lint && npx tsc --noEmit
mkdir -p docs/decisions
git add src/simulation/infrastructure/engine/ test/unit/infrastructure/engine/ docs/decisions/001-match-dynamics-intent-pattern.md
git commit -m "feat(infra): TickingSimulationEngine + ADR-001 intent pattern

- Engine: streaming tick loop, dispatches intent to aggregate, forwards real events
- Auto-finish on natural dynamics completion; early return on abort signal
- ADR-001 documents intent-pattern design decision
- 4 unit tests covering happy path, totalGoals sequence, abort mid-run, abort pre-start"
```

---

## Task 10: InMemoryCommandBus

**Files:**
- Create: `src/shared/messaging/in-memory-command-bus.ts`
- Create: `test/unit/infrastructure/messaging/in-memory-command-bus.spec.ts`

- [ ] **Step 1: Failing tests**

`test/unit/infrastructure/messaging/in-memory-command-bus.spec.ts`:
```typescript
import { InMemoryCommandBus } from '@shared/messaging/in-memory-command-bus';
import type { Command } from '@shared/messaging/command-bus.port';

interface RunCommand extends Command {
  type: 'run';
  id: string;
}

describe('InMemoryCommandBus', () => {
  it('dispatch invokes subscribed handler for matching topic', async () => {
    const bus = new InMemoryCommandBus();
    const received: RunCommand[] = [];
    bus.subscribe<RunCommand>('sim.run', async (c) => {
      received.push(c);
    });
    await bus.dispatch<RunCommand>('sim.run', { type: 'run', id: 'a' });
    expect(received).toHaveLength(1);
    expect(received[0].id).toBe('a');
  });

  it('dispatch with unsubscribed topic is a no-op', async () => {
    const bus = new InMemoryCommandBus();
    await expect(bus.dispatch('no.subscribers', { type: 'x' })).resolves.toBeUndefined();
  });

  it('multiple subscribers on same topic all receive', async () => {
    const bus = new InMemoryCommandBus();
    const a: string[] = [];
    const b: string[] = [];
    bus.subscribe<RunCommand>('sim.run', async (c) => {
      a.push(c.id);
    });
    bus.subscribe<RunCommand>('sim.run', async (c) => {
      b.push(c.id);
    });
    await bus.dispatch<RunCommand>('sim.run', { type: 'run', id: '42' });
    expect(a).toEqual(['42']);
    expect(b).toEqual(['42']);
  });

  it('unsubscribe detaches handler', async () => {
    const bus = new InMemoryCommandBus();
    const received: RunCommand[] = [];
    const sub = bus.subscribe<RunCommand>('sim.run', async (c) => {
      received.push(c);
    });
    await sub.unsubscribe();
    await bus.dispatch<RunCommand>('sim.run', { type: 'run', id: 'ignored' });
    expect(received).toEqual([]);
  });

  it('subscribers on different topics are isolated', async () => {
    const bus = new InMemoryCommandBus();
    const onRun: string[] = [];
    const onAbort: string[] = [];
    bus.subscribe<RunCommand>('sim.run', async (c) => {
      onRun.push(c.id);
    });
    bus.subscribe<RunCommand>('sim.abort', async (c) => {
      onAbort.push(c.id);
    });
    await bus.dispatch<RunCommand>('sim.run', { type: 'run', id: 'r' });
    expect(onRun).toEqual(['r']);
    expect(onAbort).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement**

`src/shared/messaging/in-memory-command-bus.ts`:
```typescript
import type { Command, CommandBus, Subscription } from './command-bus.port';

type Handler = (command: Command) => Promise<void>;

export class InMemoryCommandBus implements CommandBus {
  private readonly handlers = new Map<string, Set<Handler>>();

  async dispatch<C extends Command>(topic: string, command: C): Promise<void> {
    const set = this.handlers.get(topic);
    if (!set) return;
    for (const handler of Array.from(set)) {
      await handler(command);
    }
  }

  subscribe<C extends Command>(topic: string, handler: (command: C) => Promise<void>): Subscription {
    let set = this.handlers.get(topic);
    if (!set) {
      set = new Set();
      this.handlers.set(topic, set);
    }
    const wrapped: Handler = handler as Handler;
    set.add(wrapped);
    return {
      unsubscribe: async () => {
        set!.delete(wrapped);
        if (set!.size === 0) this.handlers.delete(topic);
      },
    };
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- in-memory-command-bus.spec
npm run lint && npx tsc --noEmit
git add src/shared/messaging/in-memory-command-bus.ts test/unit/infrastructure/messaging/in-memory-command-bus.spec.ts
git commit -m "feat(infra): InMemoryCommandBus (topic-keyed handlers, sequential dispatch)

- Map<topic, Set<handler>> backing; per-dispatch snapshot avoids modification-during-iteration
- Sequential await of handlers (order: subscription insertion)
- Subscription.unsubscribe cleans empty topic
- 5 tests"
```

---

## Task 11: InMemoryEventBus

**Files:**
- Create: `src/shared/messaging/in-memory-event-bus.ts`
- Create: `test/unit/infrastructure/messaging/in-memory-event-bus.spec.ts`

- [ ] **Step 1: Failing tests**

`test/unit/infrastructure/messaging/in-memory-event-bus.spec.ts`:
```typescript
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationStarted } from '@simulation/domain/events/simulation-started';

const simId = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
const other = SimulationId.create('550e8400-e29b-41d4-a716-446655440001');
const at = new Date('2026-04-18T12:00:00Z');

describe('InMemoryEventBus', () => {
  it('publish delivers event to matching subscriber', async () => {
    const bus = new InMemoryEventBus();
    const received: DomainEvent[] = [];
    bus.subscribe(
      () => true,
      async (e) => {
        received.push(e);
      },
    );
    await bus.publish(new SimulationStarted(simId, at));
    expect(received).toHaveLength(1);
    expect(received[0].type).toBe('SimulationStarted');
  });

  it('filter = false skips subscriber', async () => {
    const bus = new InMemoryEventBus();
    const received: DomainEvent[] = [];
    bus.subscribe(
      () => false,
      async (e) => {
        received.push(e);
      },
    );
    await bus.publish(new SimulationStarted(simId, at));
    expect(received).toEqual([]);
  });

  it('filter can discriminate by meta.simulationId', async () => {
    const bus = new InMemoryEventBus();
    const received: DomainEvent[] = [];
    bus.subscribe(
      (_e, meta) => meta.simulationId === simId.value,
      async (e) => {
        received.push(e);
      },
    );
    await bus.publish(new SimulationStarted(simId, at), { simulationId: simId.value });
    await bus.publish(new SimulationStarted(other, at), { simulationId: other.value });
    expect(received).toHaveLength(1);
  });

  it('unsubscribe detaches', async () => {
    const bus = new InMemoryEventBus();
    const received: DomainEvent[] = [];
    const sub = bus.subscribe(
      () => true,
      async (e) => {
        received.push(e);
      },
    );
    await sub.unsubscribe();
    await bus.publish(new SimulationStarted(simId, at));
    expect(received).toEqual([]);
  });

  it('multiple subscribers each get the event when filter passes', async () => {
    const bus = new InMemoryEventBus();
    const a: DomainEvent[] = [];
    const b: DomainEvent[] = [];
    bus.subscribe(
      () => true,
      async (e) => {
        a.push(e);
      },
    );
    bus.subscribe(
      () => true,
      async (e) => {
        b.push(e);
      },
    );
    await bus.publish(new SimulationStarted(simId, at));
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement**

`src/shared/messaging/in-memory-event-bus.ts`:
```typescript
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import type { EventBus, EventFilter, EventMeta } from './event-bus.port';
import type { Subscription } from './command-bus.port';

interface Entry {
  readonly filter: EventFilter;
  readonly handler: (event: DomainEvent, meta: EventMeta) => Promise<void>;
}

export class InMemoryEventBus implements EventBus {
  private readonly subscribers = new Set<Entry>();

  async publish(event: DomainEvent, meta: EventMeta = {}): Promise<void> {
    for (const entry of Array.from(this.subscribers)) {
      if (entry.filter(event, meta)) {
        await entry.handler(event, meta);
      }
    }
  }

  subscribe(
    filter: EventFilter,
    handler: (event: DomainEvent, meta: EventMeta) => Promise<void>,
  ): Subscription {
    const entry: Entry = { filter, handler };
    this.subscribers.add(entry);
    return {
      unsubscribe: async () => {
        this.subscribers.delete(entry);
      },
    };
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- in-memory-event-bus.spec
npm run lint && npx tsc --noEmit
git add src/shared/messaging/in-memory-event-bus.ts test/unit/infrastructure/messaging/in-memory-event-bus.spec.ts
git commit -m "feat(infra): InMemoryEventBus with EventFilter + EventMeta

- Set<Entry> backing; per-publish snapshot to avoid concurrent-mutation
- Filter predicate decides delivery per subscriber (used for simulationId scoping)
- 5 unit tests"
```

---

## Task 12: InMemoryEventPublisher (wraps EventBus)

**Files:**
- Create: `src/shared/messaging/in-memory-event-publisher.ts`
- Create: `test/unit/infrastructure/messaging/in-memory-event-publisher.spec.ts`

- [ ] **Step 1: Failing tests**

`test/unit/infrastructure/messaging/in-memory-event-publisher.spec.ts`:
```typescript
import { InMemoryEventPublisher } from '@shared/messaging/in-memory-event-publisher';
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import { SimulationStarted } from '@simulation/domain/events/simulation-started';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';

const simId = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
const at = new Date('2026-04-18T12:00:00Z');

describe('InMemoryEventPublisher', () => {
  it('publishes via underlying EventBus with meta.simulationId auto-derived', async () => {
    const bus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(bus);
    const received: Array<{ event: unknown; meta: unknown }> = [];
    bus.subscribe(
      () => true,
      async (event, meta) => {
        received.push({ event, meta });
      },
    );
    await publisher.publish(new SimulationStarted(simId, at));
    expect(received).toHaveLength(1);
    expect(received[0].meta).toEqual({ simulationId: simId.value });
  });
});
```

- [ ] **Step 2: Implement**

`src/shared/messaging/in-memory-event-publisher.ts`:
```typescript
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import type { EventPublisher } from '@simulation/domain/ports/event-publisher.port';
import type { EventBus } from './event-bus.port';

/**
 * EventPublisher adapter that delegates to EventBus, auto-populating
 * meta.simulationId from event.simulationId.
 */
export class InMemoryEventPublisher implements EventPublisher {
  constructor(private readonly bus: EventBus) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.bus.publish(event, { simulationId: event.simulationId.value });
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- in-memory-event-publisher.spec
npm run lint && npx tsc --noEmit
git add src/shared/messaging/in-memory-event-publisher.ts test/unit/infrastructure/messaging/in-memory-event-publisher.spec.ts
git commit -m "feat(infra): InMemoryEventPublisher wrapping EventBus

- Thin adapter implementing EventPublisher port
- Auto-derives meta.simulationId from event.simulationId
- 1 unit test (behavior is narrow)"
```

---

## Task 13: Integration test — Engine + Dynamics + FakeClock full flow

**Files:**
- Create: `test/integration/simulation-engine-end-to-end.spec.ts`

- [ ] **Step 1: Write integration test**

`test/integration/simulation-engine-end-to-end.spec.ts`:
```typescript
import { TickingSimulationEngine } from '@simulation/infrastructure/engine/ticking-simulation-engine';
import { UniformRandomGoalDynamics } from '@simulation/infrastructure/dynamics/uniform-random-goal-dynamics';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import { InMemoryEventPublisher } from '@shared/messaging/in-memory-event-publisher';
import { InMemorySimulationRepository } from '@simulation/infrastructure/persistence/in-memory-simulation.repository';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import type { DomainEvent } from '@simulation/domain/events/domain-event';

const CONFIG = {
  durationMs: 9000,
  goalIntervalMs: 1000,
  goalCount: 9,
  firstGoalOffsetMs: 1000,
  startCooldownMs: 5000,
};

describe('Simulation engine — end-to-end (in-process, FakeClock)', () => {
  it('runs full 9-goal simulation in <100ms wall-clock via FakeClock', async () => {
    const clock = new FakeClock(new Date('2026-04-18T12:00:00Z'));
    const rng = new SeededRandomProvider(42);
    const dynamics = new UniformRandomGoalDynamics(rng, CONFIG);
    const engine = new TickingSimulationEngine(clock, dynamics);
    const repo = new InMemorySimulationRepository();
    const bus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(bus);

    const sim = Simulation.create({
      id: SimulationId.create('550e8400-e29b-41d4-a716-446655440000'),
      ownerToken: OwnershipToken.create('550e8400-e29b-41d4-a716-446655440010'),
      name: SimulationName.create('Katar 2023'),
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: clock.now(),
    });
    // Drain SimulationStarted event and publish it too
    for (const e of sim.pullEvents()) await publisher.publish(e);
    await repo.save(sim);

    const observed: DomainEvent[] = [];
    bus.subscribe(
      () => true,
      async (e) => {
        observed.push(e);
      },
    );

    const wallStart = Date.now();

    const runPromise = engine.run(
      sim,
      async (e) => {
        await publisher.publish(e);
        await repo.save(sim);
      },
      new AbortController().signal,
    );
    await clock.advance(10_000); // advance 10 simulated seconds
    await runPromise;

    const wallElapsed = Date.now() - wallStart;
    expect(wallElapsed).toBeLessThan(100);

    // Event stream shape: 9 GoalScored, then SimulationFinished(auto)
    const goals = observed.filter((e) => e.type === 'GoalScored');
    const finishes = observed.filter((e) => e.type === 'SimulationFinished');
    expect(goals).toHaveLength(9);
    expect(finishes).toHaveLength(1);

    // Final state in repo
    const saved = await repo.findById(SimulationId.create('550e8400-e29b-41d4-a716-446655440000'));
    expect(saved).not.toBeNull();
    const snap = saved!.toSnapshot();
    expect(snap.state).toBe('FINISHED');
    expect(snap.totalGoals).toBe(9);
  });
});
```

- [ ] **Step 2: Update jest.config.ts to include integration tests**

If `jest.config.ts` `testRegex` currently only matches `*.spec.ts`, integration tests under `test/integration/` should already match. Verify by running the test path explicitly. If regex needs a second pattern:

Read `jest.config.ts` — if `testRegex: '.*\\.spec\\.ts$'` is present, `test/integration/*.spec.ts` is matched (`.*` is greedy). No change needed.

- [ ] **Step 3: Run + commit**

```bash
npm test -- simulation-engine-end-to-end.spec
```
Expected: 1 test PASS, <100ms wall clock.

```bash
npm run lint && npx tsc --noEmit
git add test/integration/simulation-engine-end-to-end.spec.ts
git commit -m "test(integration): Engine + Dynamics + FakeClock 9-goal flow in <100ms

- Full in-process wiring: aggregate, engine, dynamics, FakeClock, SeededRng,
  InMemoryRepo, InMemoryEventBus, InMemoryEventPublisher
- Verifies: 9 GoalScored + 1 SimulationFinished(auto), FINISHED state in repo,
  wall-clock under 100ms (9 simulated seconds via FakeClock.advance)"
```

---

## Task 14: Phase 1b — final verification + CHANGELOG

- [ ] **Step 1: Run all gates**

```bash
npm run format:check && npm run lint && npx tsc --noEmit && npm test && npm run build
```
Expected: all green. Test count should be ~115 (68 Phase 1a + ~47 new).

- [ ] **Step 2: Append CHANGELOG Phase 1b entry**

Modify `CHANGELOG.md`, insert under `[Unreleased]`:

```markdown
### Added (Phase 1b — infrastructure adapters, 2026-04-18)
- Clock adapters: `SystemClock` (setTimeout + AbortSignal), `FakeClock` (deterministic `advance(ms)` for tests)
- Random adapters: `CryptoRandomProvider` (node:crypto), `SeededRandomProvider` (LCG, deterministic)
- Persistence: `InMemorySimulationRepository`, `InMemoryOwnershipRepository`
- Token generator: `UuidOwnershipTokenGenerator` (delegates to RandomProvider)
- Policies: `FiveSecondCooldownPolicy`, `TtlRetentionPolicy`
- Domain type `SimulationConfig` (timing config for Engine/Dynamics)
- `UniformRandomGoalDynamics`: uniform 1/6 selection from `PRESET_TEAMS`, 9 goals
- `TickingSimulationEngine`: streaming tick loop with intent-dispatch to aggregate + abort handling
- Messaging: `InMemoryCommandBus`, `InMemoryEventBus`, `InMemoryEventPublisher`
- ADR-001: `MatchDynamics.nextStep.event` is an intent, not the final emitted event
- Integration test: full 9-goal flow completes in <100ms wall-clock via FakeClock

### Phase 1b status
- Branch: `phase-1-mvp-in-process` (continues)
- Still no tag — `v1.0-mvp-in-process` is created after Phase 1c (Application + Gateway + E2E)
- Next: Phase 1c — SimulationOrchestrator + REST/WS gateway + integration/E2E tests
```

- [ ] **Step 3: Commit + push**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG Phase 1b entry (infrastructure adapters complete)"
```

**Push step** (to be done by the user after reviewing):
```bash
git push origin phase-1-mvp-in-process
```

---

## Phase 1b — Task summary

| # | Task | Deliverable |
|---|---|---|
| 1 | SystemClock + FakeClock | 11 unit tests |
| 2 | CryptoRandomProvider + SeededRandomProvider | 9 unit tests |
| 3 | InMemorySimulationRepository | 7 unit tests |
| 4 | InMemoryOwnershipRepository | 4 unit tests |
| 5 | UuidOwnershipTokenGenerator | 3 unit tests |
| 6 | FiveSecondCooldownPolicy | 5 unit tests |
| 7 | TtlRetentionPolicy | 4 unit tests |
| 8 | SimulationConfig + UniformRandomGoalDynamics | 6 unit tests |
| 9 | TickingSimulationEngine + ADR-001 | 4 unit tests + 1 ADR |
| 10 | InMemoryCommandBus | 5 unit tests |
| 11 | InMemoryEventBus | 5 unit tests |
| 12 | InMemoryEventPublisher | 1 unit test |
| 13 | Integration test (end-to-end) | 1 integration test |
| 14 | Final verification + CHANGELOG + push | all gates green, CHANGELOG updated |

**Expected test count after Phase 1b:** ~115 unit + 1 integration = 116 total, <3s runtime.

**Post-implementation quality gates** (simplify + security review) remain deferred to end of Phase 1c.
