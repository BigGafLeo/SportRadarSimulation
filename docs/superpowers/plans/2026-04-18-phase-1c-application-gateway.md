# Phase 1c — Application + Consumer Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dostarczyć pełny MVP: `SimulationOrchestrator` z 5 use-case'ami (start/finish/restart/list/get), in-process `SimulationWorkerHandler` subskrybujący CommandBus, REST controllers z Zod DTOs, WebSocket gateway z broadcastem eventów do observerów, pełne integration + E2E tests (HTTP + WS + FakeClock). Na końcu: tag `v1.0-mvp-in-process` + simplify + security review.

**Architecture:** Application layer koordynuje domain i infrastructure. Orchestrator waliduje komendy (throttle, ownership) i dispatchuje via CommandBus. Worker handler subskrybuje commandy, tworzy AbortController per simulation, uruchamia Engine, manualnie wywołuje `sim.finish('manual')` na abort. REST + WS to adaptery consumer gateway. Dla Phase 1c worker żyje w tym samym procesie co orchestrator (jeden `app.module.ts`); Phase 2 wyciągnie go do osobnego entrypointa bez zmian kodu biznesowego.

**Tech Stack:** TypeScript 5.x, NestJS 10.x, Zod + nestjs-zod (DTO + ValidationPipe), `@nestjs/websockets` + `@nestjs/platform-socket.io` + `socket.io`, Jest + `@nestjs/testing` + supertest + `socket.io-client` (E2E).

**Spec reference:** `docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md` §4 (Flow), §7 (Message bus), §10 (Testing).

**Phase 1a+1b state (input):** 133 unit + 1 integration test green. Domain + infrastructure ready; only Application + Gateway + module wiring + E2E remain.

**Delivery state (expected):**
- ~180+ total tests (133 carried over + ~50 new)
- `v1.0-mvp-in-process` git tag
- HTTP API + WebSocket live on `http://localhost:3000`
- Docker compose still starts the app (jeden obraz, jedna replika)
- README req-to-test mapping updated
- simplify + security review ADRs (if findings)

---

## Key design decisions for Phase 1c

### Owner identity model (Phase 1c)

Per design spec §8.1: opaque `OwnershipToken` (UUID). Flow:
- `POST /simulations` without header → orchestrator generates token via `OwnershipTokenGenerator`, saves `OwnershipRecord` via `OwnershipRepository`, returns token in response body. Client stores locally.
- `POST /simulations` WITH `X-Simulation-Token` header → reuse existing token (owner already has other simulations). Orchestrator verifies record exists, uses it.
- `POST /simulations/:id/finish` + `POST /simulations/:id/restart` → require `X-Simulation-Token` header; orchestrator verifies `sim.ownerToken.equals(headerToken)`.

### Throttle policy scope

`FiveSecondCooldownPolicy` applied per-token (not per-IP) in orchestrator. Checked for both Start and Restart (D3 from spec: Restart ≡ Start ignition event).

### Auto-finish vs manual-finish source

- **Auto-finish**: engine emits `SimulationFinished{reason: 'auto'}` after 9th goal (already implemented in Phase 1b engine).
- **Manual-finish**: worker, upon receiving `AbortSimulationCommand`, aborts local `AbortController`, waits for `engine.run` to settle, then calls `sim.finish('manual', clock.now())` and publishes event via EventBus. Ensures aggregate is finalized and event flows through same EventBus channel.

### Reasoning for worker-in-process (Phase 1c)

CommandBus is InMemory. Worker is a service in the NestJS container that subscribes at module init. Semantically identical to out-of-process worker; Phase 2 swaps InMemoryCommandBus → BullMQCommandBus and moves worker to `src/worker.main.ts` — biznesowy kod niezmieniony.

### REST routing

Base path: no prefix (keep `POST /simulations`). If we later add versioning, add `apiPrefix: 'api/v1'`.

### WebSocket namespace

`/simulations`. Client:
```js
const socket = io('http://localhost:3000/simulations');
socket.emit('subscribe', { simulationId: '<uuid>' });
socket.on('goal-scored', (payload) => ...);
socket.on('simulation-finished', (payload) => ...);
socket.on('simulation-started', (payload) => ...);
socket.on('simulation-restarted', (payload) => ...);
```
Server broadcasts to room `simulation:${id}`. No token required (observer mode).

### Aggregate ownership of lifecycle

- Create: orchestrator (calls `Simulation.create`, saves, dispatches command)
- Mutations (applyGoal, finish, restart): inside engine/worker handler (not orchestrator) for RUNNING mutations; orchestrator's restart calls `sim.restart()` then dispatches new run command
- Save: after every aggregate mutation (always paired)

---

## File structure (Phase 1c creates)

```
src/simulation/
├── application/
│   ├── commands/
│   │   ├── simulation-topics.ts                    (topic constants)
│   │   ├── run-simulation.command.ts               (RunSimulationCommand)
│   │   └── abort-simulation.command.ts             (AbortSimulationCommand)
│   ├── orchestrator/
│   │   ├── simulation-orchestrator.ts              (5 use cases)
│   │   └── orchestrator.errors.ts                  (NotFound, OwnershipMismatch, Throttled)
│   └── worker/
│       └── simulation-worker.handler.ts            (CommandBus subscriber)
└── infrastructure/
    └── consumer/
        ├── http/
        │   ├── dto/
        │   │   ├── create-simulation.request.ts    (Zod request schema)
        │   │   ├── simulation-response.dto.ts      (Zod response schema)
        │   │   ├── list-response.dto.ts
        │   │   └── started-response.dto.ts         (POST return shape: simId + token)
        │   ├── simulation.controller.ts            (5 endpoints)
        │   ├── domain-exception.filter.ts          (domain errors → HTTP)
        │   └── simulation-token.header.ts          (header name constant)
        └── ws/
            ├── simulation.gateway.ts               (connect/subscribe/broadcast)
            └── ws-event-forwarder.ts               (EventBus → gateway rooms)
simulation.module.ts                                (NestJS DI wiring)

src/ownership/
└── ownership.module.ts                             (provider wiring)

src/app.module.ts                                   (modified — imports SimulationModule)
src/main.ts                                         (modified — worker starts at bootstrap)

test/integration/
├── http-lifecycle.e2e-spec.ts                      (full start → auto-finish)
├── http-manual-finish.e2e-spec.ts
├── http-restart.e2e-spec.ts
└── http-throttle-validation.e2e-spec.ts

test/e2e/
├── ws-goal-observer.e2e-spec.ts
└── ws-multi-observer.e2e-spec.ts

docs/decisions/
├── 002-phase-1c-simplify.md                        (if simplify review finds issues)
└── 003-phase-1c-security.md                        (if security review finds issues)
```

Removes (obsolete):
- `src/ownership/infrastructure/.gitkeep` (already deleted in 1b Task 4)
- Potential other .gitkeeps if their parent dirs now have real files

---

## Task 1: Install WS deps + Command types + topics

**Files:**
- Modify: `package.json` (via `npm install`)
- Create: `src/simulation/application/commands/simulation-topics.ts`
- Create: `src/simulation/application/commands/run-simulation.command.ts`
- Create: `src/simulation/application/commands/abort-simulation.command.ts`

- [ ] **Step 1: Install WebSocket deps**

```bash
npm install @nestjs/websockets@^10 @nestjs/platform-socket.io@^10 socket.io@^4
npm install --save-dev socket.io-client@^4
```

Verify `npm ls --depth=0` includes them without UNMET DEPENDENCY.

- [ ] **Step 2: Create topic constants**

`src/simulation/application/commands/simulation-topics.ts`:
```typescript
export const SIMULATION_TOPICS = {
  /** Orchestrator → worker: start (or restart) a simulation run. Topic suffix is profileId. */
  RUN: (profileId: string) => `simulation.run.${profileId}`,
  /** Orchestrator → worker: abort a specific running simulation. */
  ABORT: 'simulation.abort',
} as const;

export const RUN_COMMAND_TYPE = 'RunSimulation' as const;
export const ABORT_COMMAND_TYPE = 'AbortSimulation' as const;
```

- [ ] **Step 3: Create RunSimulationCommand**

`src/simulation/application/commands/run-simulation.command.ts`:
```typescript
import type { Command } from '@shared/messaging/command-bus.port';
import { RUN_COMMAND_TYPE } from './simulation-topics';

export interface RunSimulationCommand extends Command {
  readonly type: typeof RUN_COMMAND_TYPE;
  readonly simulationId: string;
  readonly profileId: string;
}

export function runSimulationCommand(simulationId: string, profileId: string): RunSimulationCommand {
  return { type: RUN_COMMAND_TYPE, simulationId, profileId };
}
```

- [ ] **Step 4: Create AbortSimulationCommand**

`src/simulation/application/commands/abort-simulation.command.ts`:
```typescript
import type { Command } from '@shared/messaging/command-bus.port';
import { ABORT_COMMAND_TYPE } from './simulation-topics';

export interface AbortSimulationCommand extends Command {
  readonly type: typeof ABORT_COMMAND_TYPE;
  readonly simulationId: string;
  readonly finishedAtMs: number;
}

export function abortSimulationCommand(simulationId: string, finishedAtMs: number): AbortSimulationCommand {
  return { type: ABORT_COMMAND_TYPE, simulationId, finishedAtMs };
}
```

- [ ] **Step 5: Remove .gitkeep, verify, commit**

```bash
rm src/simulation/application/.gitkeep 2>/dev/null || true
npx tsc --noEmit && npm run lint
git add package.json package-lock.json src/simulation/application/commands/
git add -u src/simulation/application/.gitkeep 2>/dev/null || true
git commit -m "feat(app): Command types (Run + Abort) + SIMULATION_TOPICS + WS deps

- RunSimulationCommand, AbortSimulationCommand with stable type constants
- SIMULATION_TOPICS.RUN(profileId) / ABORT for CommandBus routing
- Installed @nestjs/websockets + @nestjs/platform-socket.io + socket.io (runtime) + socket.io-client (dev)"
```

---

## Task 2: SimulationOrchestrator + 5 use cases

**Files:**
- Create: `src/simulation/application/orchestrator/orchestrator.errors.ts`
- Create: `src/simulation/application/orchestrator/simulation-orchestrator.ts`
- Create: `test/unit/application/orchestrator/simulation-orchestrator.spec.ts`

Orchestrator has 5 methods: `startSimulation`, `finishSimulation`, `restartSimulation`, `listSimulations`, `getSimulation`. All async. Uses injected ports: `SimulationRepository`, `OwnershipRepository`, `OwnershipTokenGenerator`, `ThrottlePolicy`, `CommandBus`, `EventPublisher`, `Clock`, `SimulationConfig`.

- [ ] **Step 1: Create orchestrator errors**

`src/simulation/application/orchestrator/orchestrator.errors.ts`:
```typescript
import { DomainError } from '@simulation/domain/errors/domain.error';

export class SimulationNotFoundError extends DomainError {
  constructor(public readonly simulationId: string) {
    super(`Simulation not found: ${simulationId}`);
  }
}

export class OwnershipMismatchError extends DomainError {
  constructor(public readonly simulationId: string) {
    super(`Token does not own simulation ${simulationId}`);
  }
}

export class ThrottledError extends DomainError {
  constructor(public readonly cooldownMs: number) {
    super(`Start rejected: cooldown ${cooldownMs}ms not elapsed`);
  }
}

export class UnknownTokenError extends DomainError {
  constructor(public readonly token: string) {
    super(`Ownership token unknown: ${token}`);
  }
}
```

- [ ] **Step 2: Failing tests**

`test/unit/application/orchestrator/simulation-orchestrator.spec.ts`:
```typescript
import { SimulationOrchestrator } from '@simulation/application/orchestrator/simulation-orchestrator';
import {
  SimulationNotFoundError,
  OwnershipMismatchError,
  ThrottledError,
  UnknownTokenError,
} from '@simulation/application/orchestrator/orchestrator.errors';
import { InMemorySimulationRepository } from '@simulation/infrastructure/persistence/in-memory-simulation.repository';
import { InMemoryOwnershipRepository } from '@ownership/infrastructure/in-memory-ownership.repository';
import { InMemoryCommandBus } from '@shared/messaging/in-memory-command-bus';
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import { InMemoryEventPublisher } from '@shared/messaging/in-memory-event-publisher';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { UuidOwnershipTokenGenerator } from '@ownership/infrastructure/uuid-ownership-token.generator';
import { FiveSecondCooldownPolicy } from '@simulation/infrastructure/policies/five-second-cooldown.policy';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import { RUN_COMMAND_TYPE, ABORT_COMMAND_TYPE, SIMULATION_TOPICS } from '@simulation/application/commands/simulation-topics';

const CONFIG = {
  durationMs: 9000,
  goalIntervalMs: 1000,
  goalCount: 9,
  firstGoalOffsetMs: 1000,
  startCooldownMs: 5000,
};

function buildWiring() {
  const clock = new FakeClock(new Date('2026-04-18T12:00:00Z'));
  const rng = new SeededRandomProvider(42);
  const simRepo = new InMemorySimulationRepository();
  const ownerRepo = new InMemoryOwnershipRepository();
  const cmdBus = new InMemoryCommandBus();
  const eventBus = new InMemoryEventBus();
  const publisher = new InMemoryEventPublisher(eventBus);
  const tokenGen = new UuidOwnershipTokenGenerator(rng);
  const throttle = new FiveSecondCooldownPolicy(CONFIG.startCooldownMs);

  const orchestrator = new SimulationOrchestrator({
    simulationRepository: simRepo,
    ownershipRepository: ownerRepo,
    tokenGenerator: tokenGen,
    throttlePolicy: throttle,
    commandBus: cmdBus,
    eventPublisher: publisher,
    clock,
    config: CONFIG,
    defaultProfileId: 'default',
  });

  return { clock, rng, simRepo, ownerRepo, cmdBus, eventBus, publisher, orchestrator };
}

describe('SimulationOrchestrator', () => {
  describe('startSimulation', () => {
    it('creates simulation with new token when no token provided', async () => {
      const w = buildWiring();
      const result = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      expect(result.simulationId).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.ownershipToken).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.state).toBe('RUNNING');

      const saved = await w.simRepo.findById(SimulationId.create(result.simulationId));
      expect(saved).not.toBeNull();
      expect(saved!.toSnapshot().name).toBe('Katar 2023');
    });

    it('reuses existing token when provided', async () => {
      const w = buildWiring();
      const first = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      await w.clock.advance(6000); // pass throttle
      const second = await w.orchestrator.startSimulation({
        name: 'Paryz 2024',
        ownershipToken: OwnershipToken.create(first.ownershipToken),
      });
      expect(second.ownershipToken).toBe(first.ownershipToken);
      expect(second.simulationId).not.toBe(first.simulationId);
    });

    it('rejects unknown token', async () => {
      const w = buildWiring();
      await expect(
        w.orchestrator.startSimulation({
          name: 'Katar 2023',
          ownershipToken: OwnershipToken.create('550e8400-e29b-41d4-a716-999999999999'),
        }),
      ).rejects.toThrow(UnknownTokenError);
    });

    it('rejects when throttle cooldown not elapsed', async () => {
      const w = buildWiring();
      const first = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      await w.clock.advance(3000); // under 5s
      await expect(
        w.orchestrator.startSimulation({
          name: 'Paryz 2024',
          ownershipToken: OwnershipToken.create(first.ownershipToken),
        }),
      ).rejects.toThrow(ThrottledError);
    });

    it('dispatches RunSimulationCommand via CommandBus', async () => {
      const w = buildWiring();
      const dispatched: unknown[] = [];
      w.cmdBus.subscribe(SIMULATION_TOPICS.RUN('default'), async (cmd) => {
        dispatched.push(cmd);
      });
      const result = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      expect(dispatched).toHaveLength(1);
      const cmd = dispatched[0] as { type: string; simulationId: string };
      expect(cmd.type).toBe(RUN_COMMAND_TYPE);
      expect(cmd.simulationId).toBe(result.simulationId);
    });

    it('publishes SimulationStarted event on EventBus', async () => {
      const w = buildWiring();
      const events: DomainEvent[] = [];
      w.eventBus.subscribe(
        () => true,
        async (e) => {
          events.push(e);
        },
      );
      await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      expect(events.some((e) => e.type === 'SimulationStarted')).toBe(true);
    });

    it('updates lastIgnitionAt on ownership record', async () => {
      const w = buildWiring();
      const result = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      const rec = await w.ownerRepo.findByToken(OwnershipToken.create(result.ownershipToken));
      expect(rec?.lastIgnitionAt).toEqual(w.clock.now());
    });
  });

  describe('finishSimulation', () => {
    it('dispatches AbortSimulationCommand when caller is owner', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      const aborts: unknown[] = [];
      w.cmdBus.subscribe(SIMULATION_TOPICS.ABORT, async (cmd) => {
        aborts.push(cmd);
      });
      await w.orchestrator.finishSimulation({
        simulationId: SimulationId.create(started.simulationId),
        ownershipToken: OwnershipToken.create(started.ownershipToken),
      });
      expect(aborts).toHaveLength(1);
      const cmd = aborts[0] as { type: string; simulationId: string };
      expect(cmd.type).toBe(ABORT_COMMAND_TYPE);
      expect(cmd.simulationId).toBe(started.simulationId);
    });

    it('rejects OwnershipMismatch when token differs', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      const wrongToken = OwnershipToken.create('550e8400-e29b-41d4-a716-000000000abc');
      // ensure wrongToken exists in repo but doesn't own the sim
      await w.ownerRepo.save({ token: wrongToken, createdAt: w.clock.now(), lastIgnitionAt: null });
      await expect(
        w.orchestrator.finishSimulation({
          simulationId: SimulationId.create(started.simulationId),
          ownershipToken: wrongToken,
        }),
      ).rejects.toThrow(OwnershipMismatchError);
    });

    it('rejects NotFound on unknown simulationId', async () => {
      const w = buildWiring();
      await expect(
        w.orchestrator.finishSimulation({
          simulationId: SimulationId.create('550e8400-e29b-41d4-a716-000000000000'),
          ownershipToken: OwnershipToken.create('550e8400-e29b-41d4-a716-000000000001'),
        }),
      ).rejects.toThrow(SimulationNotFoundError);
    });
  });

  describe('restartSimulation', () => {
    it('resets score + totalGoals + dispatches Run command when owner + FINISHED', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      // Manually finish the simulation (simulate engine auto-finish)
      const sim = (await w.simRepo.findById(SimulationId.create(started.simulationId)))!;
      sim.finish('auto', w.clock.now());
      await w.simRepo.save(sim);
      // Drain events from auto-finish
      sim.pullEvents();

      await w.clock.advance(6000); // past throttle

      const runs: unknown[] = [];
      w.cmdBus.subscribe(SIMULATION_TOPICS.RUN('default'), async (cmd) => {
        runs.push(cmd);
      });
      await w.orchestrator.restartSimulation({
        simulationId: SimulationId.create(started.simulationId),
        ownershipToken: OwnershipToken.create(started.ownershipToken),
      });
      const after = (await w.simRepo.findById(SimulationId.create(started.simulationId)))!.toSnapshot();
      expect(after.state).toBe('RUNNING');
      expect(after.totalGoals).toBe(0);
      expect(runs).toHaveLength(1);
    });

    it('respects throttle on restart as on start', async () => {
      const w = buildWiring();
      const started = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      const sim = (await w.simRepo.findById(SimulationId.create(started.simulationId)))!;
      sim.finish('manual', w.clock.now());
      await w.simRepo.save(sim);
      sim.pullEvents();
      await w.clock.advance(2000); // still under cooldown
      await expect(
        w.orchestrator.restartSimulation({
          simulationId: SimulationId.create(started.simulationId),
          ownershipToken: OwnershipToken.create(started.ownershipToken),
        }),
      ).rejects.toThrow(ThrottledError);
    });
  });

  describe('listSimulations + getSimulation', () => {
    it('listSimulations returns all snapshots', async () => {
      const w = buildWiring();
      const a = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      await w.clock.advance(6000);
      const b = await w.orchestrator.startSimulation({
        name: 'Paryz 2024',
        ownershipToken: OwnershipToken.create(a.ownershipToken),
      });
      const list = await w.orchestrator.listSimulations();
      expect(list.map((s) => s.id).sort()).toEqual([a.simulationId, b.simulationId].sort());
    });

    it('getSimulation returns snapshot for existing id', async () => {
      const w = buildWiring();
      const a = await w.orchestrator.startSimulation({ name: 'Katar 2023' });
      const snap = await w.orchestrator.getSimulation(SimulationId.create(a.simulationId));
      expect(snap.id).toBe(a.simulationId);
      expect(snap.name).toBe('Katar 2023');
    });

    it('getSimulation throws NotFound when missing', async () => {
      const w = buildWiring();
      await expect(
        w.orchestrator.getSimulation(SimulationId.create('550e8400-e29b-41d4-a716-111111111111')),
      ).rejects.toThrow(SimulationNotFoundError);
    });
  });
});
```

- [ ] **Step 3: Implement orchestrator**

`src/simulation/application/orchestrator/simulation-orchestrator.ts`:
```typescript
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import type { SimulationSnapshot } from '@simulation/domain/aggregates/simulation';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { SimulationConfig } from '@simulation/domain/simulation-config';
import type { Clock } from '@simulation/domain/ports/clock.port';
import type { ThrottlePolicy } from '@simulation/domain/ports/throttle-policy.port';
import type { EventPublisher } from '@simulation/domain/ports/event-publisher.port';
import type { OwnershipRepository } from '@ownership/domain/ports/ownership-repository.port';
import type { OwnershipTokenGenerator } from '@ownership/domain/ports/ownership-token-generator.port';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import type { CommandBus } from '@shared/messaging/command-bus.port';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import { runSimulationCommand } from '../commands/run-simulation.command';
import { abortSimulationCommand } from '../commands/abort-simulation.command';
import { SIMULATION_TOPICS } from '../commands/simulation-topics';
import {
  SimulationNotFoundError,
  OwnershipMismatchError,
  ThrottledError,
  UnknownTokenError,
} from './orchestrator.errors';

export interface StartSimulationInput {
  readonly name: string;
  readonly ownershipToken?: OwnershipToken;
  readonly profileId?: string;
}

export interface StartSimulationResult {
  readonly simulationId: string;
  readonly ownershipToken: string;
  readonly state: 'RUNNING';
  readonly initialSnapshot: SimulationSnapshot;
}

export interface FinishSimulationInput {
  readonly simulationId: SimulationId;
  readonly ownershipToken: OwnershipToken;
}

export interface RestartSimulationInput {
  readonly simulationId: SimulationId;
  readonly ownershipToken: OwnershipToken;
}

export interface SimulationOrchestratorDeps {
  readonly simulationRepository: SimulationRepository;
  readonly ownershipRepository: OwnershipRepository;
  readonly tokenGenerator: OwnershipTokenGenerator;
  readonly throttlePolicy: ThrottlePolicy;
  readonly commandBus: CommandBus;
  readonly eventPublisher: EventPublisher;
  readonly clock: Clock;
  readonly config: SimulationConfig;
  readonly defaultProfileId: string;
}

export class SimulationOrchestrator {
  constructor(private readonly deps: SimulationOrchestratorDeps) {}

  async startSimulation(input: StartSimulationInput): Promise<StartSimulationResult> {
    const name = SimulationName.create(input.name);
    const profileId = input.profileId ?? this.deps.defaultProfileId;
    const now = this.deps.clock.now();

    const token = await this.resolveOrIssueToken(input.ownershipToken, now);
    await this.ensureCanIgnite(token, now);

    const simulationId = SimulationId.create(this.deps.tokenGenerator.generate().value);
    const sim = Simulation.create({
      id: simulationId,
      ownerToken: token,
      name,
      matches: PRESET_MATCHES,
      profileId,
      now,
    });

    await this.deps.simulationRepository.save(sim);
    await this.deps.ownershipRepository.updateLastIgnitionAt(token, now);
    for (const evt of sim.pullEvents()) {
      await this.deps.eventPublisher.publish(evt);
    }

    await this.deps.commandBus.dispatch(
      SIMULATION_TOPICS.RUN(profileId),
      runSimulationCommand(simulationId.value, profileId),
    );

    return {
      simulationId: simulationId.value,
      ownershipToken: token.value,
      state: 'RUNNING',
      initialSnapshot: sim.toSnapshot(),
    };
  }

  async finishSimulation(input: FinishSimulationInput): Promise<void> {
    const sim = await this.findSimulationOrThrow(input.simulationId);
    this.assertOwnership(sim, input.ownershipToken);
    await this.deps.commandBus.dispatch(
      SIMULATION_TOPICS.ABORT,
      abortSimulationCommand(input.simulationId.value, this.deps.clock.now().getTime()),
    );
  }

  async restartSimulation(input: RestartSimulationInput): Promise<void> {
    const sim = await this.findSimulationOrThrow(input.simulationId);
    this.assertOwnership(sim, input.ownershipToken);
    const now = this.deps.clock.now();
    await this.ensureCanIgnite(input.ownershipToken, now);

    sim.restart(now);
    await this.deps.simulationRepository.save(sim);
    await this.deps.ownershipRepository.updateLastIgnitionAt(input.ownershipToken, now);
    for (const evt of sim.pullEvents()) {
      await this.deps.eventPublisher.publish(evt);
    }

    await this.deps.commandBus.dispatch(
      SIMULATION_TOPICS.RUN(sim.profileId),
      runSimulationCommand(input.simulationId.value, sim.profileId),
    );
  }

  async listSimulations(): Promise<readonly SimulationSnapshot[]> {
    const all = await this.deps.simulationRepository.findAll();
    return all.map((s) => s.toSnapshot());
  }

  async getSimulation(id: SimulationId): Promise<SimulationSnapshot> {
    const sim = await this.findSimulationOrThrow(id);
    return sim.toSnapshot();
  }

  // Internal helpers

  private async resolveOrIssueToken(
    provided: OwnershipToken | undefined,
    now: Date,
  ): Promise<OwnershipToken> {
    if (provided) {
      const rec = await this.deps.ownershipRepository.findByToken(provided);
      if (!rec) {
        throw new UnknownTokenError(provided.value);
      }
      return provided;
    }
    const token = this.deps.tokenGenerator.generate();
    await this.deps.ownershipRepository.save({
      token,
      createdAt: now,
      lastIgnitionAt: null,
    });
    return token;
  }

  private async ensureCanIgnite(token: OwnershipToken, now: Date): Promise<void> {
    const rec = await this.deps.ownershipRepository.findByToken(token);
    if (!rec) {
      throw new UnknownTokenError(token.value);
    }
    if (!this.deps.throttlePolicy.canIgnite(token, rec.lastIgnitionAt, now)) {
      throw new ThrottledError(this.deps.config.startCooldownMs);
    }
  }

  private async findSimulationOrThrow(id: SimulationId): Promise<Simulation> {
    const sim = await this.deps.simulationRepository.findById(id);
    if (!sim) {
      throw new SimulationNotFoundError(id.value);
    }
    return sim;
  }

  private assertOwnership(sim: Simulation, token: OwnershipToken): void {
    if (!sim.ownerToken.equals(token)) {
      throw new OwnershipMismatchError(sim.id.value);
    }
  }
}
```

- [ ] **Step 4: Run + commit**

```bash
npm test -- simulation-orchestrator.spec
npm run lint && npx tsc --noEmit
git add src/simulation/application/orchestrator/ test/unit/application/orchestrator/
git commit -m "feat(app): SimulationOrchestrator — 5 use cases (start/finish/restart/list/get)

- Dependency injection via SimulationOrchestratorDeps struct; no NestJS decorators
  (testable with fake ports, DI wiring in Phase 1c Task 8)
- startSimulation: issues or reuses OwnershipToken, throttle check, creates
  aggregate, saves, publishes events, dispatches RunSimulationCommand
- finishSimulation: ownership check, dispatches AbortSimulationCommand (worker
  finalizes via manual finish)
- restartSimulation: ownership + throttle + aggregate.restart + dispatch Run
- list/get: pure read, maps to SimulationSnapshot
- Errors: SimulationNotFoundError, OwnershipMismatchError, ThrottledError, UnknownTokenError
- ~15 unit tests covering all branches"
```

---

## Task 3: SimulationWorkerHandler (CommandBus subscriber)

**Files:**
- Create: `src/simulation/application/worker/simulation-worker.handler.ts`
- Create: `test/unit/application/worker/simulation-worker.handler.spec.ts`

Subscribes to `simulation.run.{profileId}` + `simulation.abort`. Maintains per-simulation `AbortController`. On run: load aggregate, run engine with emit callback that publishes + saves. On abort: lookup controller, abort, wait for run to settle, `sim.finish('manual', now)`, save, publish event.

- [ ] **Step 1: Failing tests**

`test/unit/application/worker/simulation-worker.handler.spec.ts`:
```typescript
import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';
import { TickingSimulationEngine } from '@simulation/infrastructure/engine/ticking-simulation-engine';
import { UniformRandomGoalDynamics } from '@simulation/infrastructure/dynamics/uniform-random-goal-dynamics';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { InMemorySimulationRepository } from '@simulation/infrastructure/persistence/in-memory-simulation.repository';
import { InMemoryCommandBus } from '@shared/messaging/in-memory-command-bus';
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import { InMemoryEventPublisher } from '@shared/messaging/in-memory-event-publisher';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import { runSimulationCommand } from '@simulation/application/commands/run-simulation.command';
import { abortSimulationCommand } from '@simulation/application/commands/abort-simulation.command';
import { SIMULATION_TOPICS } from '@simulation/application/commands/simulation-topics';
import type { DomainEvent } from '@simulation/domain/events/domain-event';

const CONFIG = {
  durationMs: 9000,
  goalIntervalMs: 1000,
  goalCount: 9,
  firstGoalOffsetMs: 1000,
  startCooldownMs: 5000,
};

async function tickTo(clock: FakeClock, totalMs: number): Promise<void> {
  for (let elapsed = 0; elapsed < totalMs; elapsed += 1) {
    await clock.advance(1);
  }
}

describe('SimulationWorkerHandler', () => {
  async function buildRunningSim(
    simRepo: InMemorySimulationRepository,
    clock: FakeClock,
  ): Promise<{ id: SimulationId; token: OwnershipToken }> {
    const id = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
    const token = OwnershipToken.create('550e8400-e29b-41d4-a716-446655440010');
    const sim = Simulation.create({
      id,
      ownerToken: token,
      name: SimulationName.create('Katar 2023'),
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: clock.now(),
    });
    sim.pullEvents(); // drain SimulationStarted (orchestrator would have published it)
    await simRepo.save(sim);
    return { id, token };
  }

  it('runs engine to completion on RunSimulationCommand, emits 9 goals + auto-finish', async () => {
    const clock = new FakeClock(new Date(0));
    const simRepo = new InMemorySimulationRepository();
    const cmdBus = new InMemoryCommandBus();
    const eventBus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(eventBus);
    const engine = new TickingSimulationEngine(
      clock,
      new UniformRandomGoalDynamics(new SeededRandomProvider(42), CONFIG),
    );
    const handler = new SimulationWorkerHandler({
      simulationRepository: simRepo,
      commandBus: cmdBus,
      eventPublisher: publisher,
      engine,
      clock,
      profileId: 'default',
    });
    handler.subscribe();

    const observed: DomainEvent[] = [];
    eventBus.subscribe(
      () => true,
      async (e) => {
        observed.push(e);
      },
    );

    const { id } = await buildRunningSim(simRepo, clock);

    // Dispatch run
    await cmdBus.dispatch(SIMULATION_TOPICS.RUN('default'), runSimulationCommand(id.value, 'default'));
    await tickTo(clock, 10_000);
    await handler.drainInFlight();

    const goals = observed.filter((e) => e.type === 'GoalScored');
    const finishes = observed.filter((e) => e.type === 'SimulationFinished');
    expect(goals).toHaveLength(9);
    expect(finishes).toHaveLength(1);
    if (finishes[0].type === 'SimulationFinished') {
      expect(finishes[0].reason).toBe('auto');
    }
  });

  it('abort mid-run finishes with reason=manual, emits SimulationFinished', async () => {
    const clock = new FakeClock(new Date(0));
    const simRepo = new InMemorySimulationRepository();
    const cmdBus = new InMemoryCommandBus();
    const eventBus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(eventBus);
    const engine = new TickingSimulationEngine(
      clock,
      new UniformRandomGoalDynamics(new SeededRandomProvider(42), CONFIG),
    );
    const handler = new SimulationWorkerHandler({
      simulationRepository: simRepo,
      commandBus: cmdBus,
      eventPublisher: publisher,
      engine,
      clock,
      profileId: 'default',
    });
    handler.subscribe();

    const observed: DomainEvent[] = [];
    eventBus.subscribe(
      () => true,
      async (e) => {
        observed.push(e);
      },
    );

    const { id } = await buildRunningSim(simRepo, clock);
    await cmdBus.dispatch(SIMULATION_TOPICS.RUN('default'), runSimulationCommand(id.value, 'default'));

    await tickTo(clock, 3000);
    await cmdBus.dispatch(
      SIMULATION_TOPICS.ABORT,
      abortSimulationCommand(id.value, clock.now().getTime()),
    );
    await handler.drainInFlight();

    const goals = observed.filter((e) => e.type === 'GoalScored');
    const finishes = observed.filter((e) => e.type === 'SimulationFinished');
    expect(goals.length).toBeLessThan(9);
    expect(finishes).toHaveLength(1);
    if (finishes[0].type === 'SimulationFinished') {
      expect(finishes[0].reason).toBe('manual');
    }
  });

  it('abort for unknown simulationId is a no-op (ignored silently)', async () => {
    const clock = new FakeClock(new Date(0));
    const simRepo = new InMemorySimulationRepository();
    const cmdBus = new InMemoryCommandBus();
    const publisher = new InMemoryEventPublisher(new InMemoryEventBus());
    const engine = new TickingSimulationEngine(
      clock,
      new UniformRandomGoalDynamics(new SeededRandomProvider(42), CONFIG),
    );
    const handler = new SimulationWorkerHandler({
      simulationRepository: simRepo,
      commandBus: cmdBus,
      eventPublisher: publisher,
      engine,
      clock,
      profileId: 'default',
    });
    handler.subscribe();

    await expect(
      cmdBus.dispatch(
        SIMULATION_TOPICS.ABORT,
        abortSimulationCommand('550e8400-e29b-41d4-a716-446655440000', 0),
      ),
    ).resolves.toBeUndefined();
  });

  it('shutdown() aborts in-flight runs and detaches subscriptions', async () => {
    const clock = new FakeClock(new Date(0));
    const simRepo = new InMemorySimulationRepository();
    const cmdBus = new InMemoryCommandBus();
    const eventBus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(eventBus);
    const engine = new TickingSimulationEngine(
      clock,
      new UniformRandomGoalDynamics(new SeededRandomProvider(42), CONFIG),
    );
    const handler = new SimulationWorkerHandler({
      simulationRepository: simRepo,
      commandBus: cmdBus,
      eventPublisher: publisher,
      engine,
      clock,
      profileId: 'default',
    });
    handler.subscribe();

    const { id } = await buildRunningSim(simRepo, clock);
    await cmdBus.dispatch(SIMULATION_TOPICS.RUN('default'), runSimulationCommand(id.value, 'default'));
    await tickTo(clock, 2000);

    await handler.shutdown();

    // After shutdown, subsequent Run commands should be ignored
    const { id: id2 } = await buildRunningSim(simRepo, clock);
    await cmdBus.dispatch(SIMULATION_TOPICS.RUN('default'), runSimulationCommand(id2.value, 'default'));
    // No new events produced for id2 (subscription detached)
    const snap = (await simRepo.findById(id2))!.toSnapshot();
    expect(snap.totalGoals).toBe(0);
  });
});
```

- [ ] **Step 2: Implement worker handler**

`src/simulation/application/worker/simulation-worker.handler.ts`:
```typescript
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { SimulationEngine } from '@simulation/domain/ports/simulation-engine.port';
import type { EventPublisher } from '@simulation/domain/ports/event-publisher.port';
import type { Clock } from '@simulation/domain/ports/clock.port';
import type { CommandBus, Subscription } from '@shared/messaging/command-bus.port';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SIMULATION_TOPICS } from '../commands/simulation-topics';
import type { RunSimulationCommand } from '../commands/run-simulation.command';
import type { AbortSimulationCommand } from '../commands/abort-simulation.command';

export interface SimulationWorkerHandlerDeps {
  readonly simulationRepository: SimulationRepository;
  readonly commandBus: CommandBus;
  readonly eventPublisher: EventPublisher;
  readonly engine: SimulationEngine;
  readonly clock: Clock;
  readonly profileId: string;
}

interface InFlight {
  readonly controller: AbortController;
  readonly runPromise: Promise<void>;
}

export class SimulationWorkerHandler {
  private readonly inFlight = new Map<string, InFlight>();
  private readonly subscriptions: Subscription[] = [];

  constructor(private readonly deps: SimulationWorkerHandlerDeps) {}

  subscribe(): void {
    this.subscriptions.push(
      this.deps.commandBus.subscribe<RunSimulationCommand>(
        SIMULATION_TOPICS.RUN(this.deps.profileId),
        async (cmd) => {
          await this.handleRun(cmd);
        },
      ),
    );
    this.subscriptions.push(
      this.deps.commandBus.subscribe<AbortSimulationCommand>(
        SIMULATION_TOPICS.ABORT,
        async (cmd) => {
          await this.handleAbort(cmd);
        },
      ),
    );
  }

  async shutdown(): Promise<void> {
    for (const sub of this.subscriptions) {
      await sub.unsubscribe();
    }
    this.subscriptions.length = 0;
    for (const inflight of this.inFlight.values()) {
      inflight.controller.abort();
    }
    await this.drainInFlight();
  }

  async drainInFlight(): Promise<void> {
    const promises = Array.from(this.inFlight.values()).map((i) => i.runPromise.catch(() => undefined));
    await Promise.all(promises);
  }

  private async handleRun(cmd: RunSimulationCommand): Promise<void> {
    const sim = await this.deps.simulationRepository.findById(SimulationId.create(cmd.simulationId));
    if (!sim) return;

    const controller = new AbortController();
    const runPromise = this.deps.engine
      .run(
        sim,
        async (event) => {
          await this.deps.simulationRepository.save(sim);
          await this.deps.eventPublisher.publish(event);
        },
        controller.signal,
      )
      .finally(() => {
        this.inFlight.delete(cmd.simulationId);
      });

    this.inFlight.set(cmd.simulationId, { controller, runPromise });
    await runPromise;
  }

  private async handleAbort(cmd: AbortSimulationCommand): Promise<void> {
    const inflight = this.inFlight.get(cmd.simulationId);
    if (!inflight) return;

    inflight.controller.abort();
    await inflight.runPromise.catch(() => undefined);

    const sim = await this.deps.simulationRepository.findById(SimulationId.create(cmd.simulationId));
    if (!sim) return;
    if (sim.toSnapshot().state !== 'RUNNING') return; // already auto-finished

    sim.finish('manual', new Date(cmd.finishedAtMs));
    await this.deps.simulationRepository.save(sim);
    for (const evt of sim.pullEvents()) {
      await this.deps.eventPublisher.publish(evt);
    }
  }
}
```

- [ ] **Step 3: Remove .gitkeep, run + commit**

```bash
rm src/simulation/application/.gitkeep 2>/dev/null || true
npm test -- simulation-worker.handler.spec
npm run lint && npx tsc --noEmit
git add src/simulation/application/worker/ test/unit/application/worker/
git add -u src/simulation/application/.gitkeep 2>/dev/null || true
git commit -m "feat(app): SimulationWorkerHandler — CommandBus subscriber with AbortController mgmt

- Subscribes simulation.run.{profileId} → engine.run with emit-wrapped save + publish
- Subscribes simulation.abort → abort controller, drain, manual finish + publish
- drainInFlight(): awaits all pending runs (used by integration tests and shutdown)
- shutdown(): detach subscriptions, abort + drain — used by NestJS lifecycle
- 4 unit tests"
```

---

## Task 4: Zod DTOs + response shapes

**Files:**
- Create: `src/simulation/infrastructure/consumer/http/dto/create-simulation.request.ts`
- Create: `src/simulation/infrastructure/consumer/http/dto/simulation-response.dto.ts`
- Create: `src/simulation/infrastructure/consumer/http/dto/started-response.dto.ts`
- Create: `src/simulation/infrastructure/consumer/http/simulation-token.header.ts`

- [ ] **Step 1: Create DTOs**

`src/simulation/infrastructure/consumer/http/simulation-token.header.ts`:
```typescript
export const SIMULATION_TOKEN_HEADER = 'x-simulation-token';
```

`src/simulation/infrastructure/consumer/http/dto/create-simulation.request.ts`:
```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { SimulationNameSchema } from '@simulation/domain/value-objects/simulation-name';

export const CreateSimulationRequestSchema = z.object({
  name: SimulationNameSchema,
});

export class CreateSimulationRequestDto extends createZodDto(CreateSimulationRequestSchema) {}
```

`src/simulation/infrastructure/consumer/http/dto/simulation-response.dto.ts`:
```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const MatchScoreSchema = z.object({
  matchId: z.string(),
  home: z.number().int().nonnegative(),
  away: z.number().int().nonnegative(),
});

export const SimulationResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  state: z.enum(['RUNNING', 'FINISHED']),
  score: z.array(MatchScoreSchema),
  totalGoals: z.number().int().nonnegative(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  profileId: z.string(),
});

export class SimulationResponseDto extends createZodDto(SimulationResponseSchema) {}
```

`src/simulation/infrastructure/consumer/http/dto/started-response.dto.ts`:
```typescript
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { SimulationResponseSchema } from './simulation-response.dto';

export const StartedResponseSchema = z.object({
  simulationId: z.string().uuid(),
  ownershipToken: z.string().uuid(),
  state: z.literal('RUNNING'),
  initialSnapshot: SimulationResponseSchema,
});

export class StartedResponseDto extends createZodDto(StartedResponseSchema) {}
```

- [ ] **Step 2: Commit**

```bash
npm run lint && npx tsc --noEmit
git add src/simulation/infrastructure/consumer/
git commit -m "feat(http): Zod DTOs — CreateSimulationRequest, SimulationResponse, StartedResponse

- Re-uses SimulationNameSchema from domain VO (single source of truth)
- createZodDto generates NestJS-compatible classes for @Body/@Query validation
- SIMULATION_TOKEN_HEADER constant ('x-simulation-token')
- Response shapes match SimulationSnapshot with Date→ISO string serialization"
```

---

## Task 5: Domain exception filter (domain errors → HTTP codes)

**Files:**
- Create: `src/simulation/infrastructure/consumer/http/domain-exception.filter.ts`
- Create: `test/unit/infrastructure/consumer/http/domain-exception.filter.spec.ts`

- [ ] **Step 1: Failing tests**

`test/unit/infrastructure/consumer/http/domain-exception.filter.spec.ts`:
```typescript
import { DomainExceptionFilter } from '@simulation/infrastructure/consumer/http/domain-exception.filter';
import { InvalidStateError } from '@simulation/domain/errors/invalid-state.error';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';
import {
  SimulationNotFoundError,
  OwnershipMismatchError,
  ThrottledError,
  UnknownTokenError,
} from '@simulation/application/orchestrator/orchestrator.errors';

interface MockResponse {
  status: (code: number) => MockResponse;
  json: (body: unknown) => void;
  _status?: number;
  _body?: unknown;
}

function mockHost(): { response: MockResponse; host: any } {
  const response: MockResponse = {
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
    }),
  };
  return { response, host };
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it('maps InvalidValueError → 400', () => {
    const { response, host } = mockHost();
    filter.catch(new InvalidValueError('name', 'too short', 'abc'), host);
    expect(response._status).toBe(400);
    expect(response._body).toMatchObject({
      error: { code: 'INVALID_VALUE', field: 'name' },
    });
  });

  it('maps InvalidStateError → 409', () => {
    const { response, host } = mockHost();
    filter.catch(new InvalidStateError('FINISHED', 'apply goal to'), host);
    expect(response._status).toBe(409);
    expect(response._body).toMatchObject({
      error: { code: 'INVALID_STATE' },
    });
  });

  it('maps SimulationNotFoundError → 404', () => {
    const { response, host } = mockHost();
    filter.catch(new SimulationNotFoundError('abc'), host);
    expect(response._status).toBe(404);
    expect(response._body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('maps OwnershipMismatchError → 403', () => {
    const { response, host } = mockHost();
    filter.catch(new OwnershipMismatchError('abc'), host);
    expect(response._status).toBe(403);
  });

  it('maps ThrottledError → 429', () => {
    const { response, host } = mockHost();
    filter.catch(new ThrottledError(5000), host);
    expect(response._status).toBe(429);
  });

  it('maps UnknownTokenError → 401', () => {
    const { response, host } = mockHost();
    filter.catch(new UnknownTokenError('abc'), host);
    expect(response._status).toBe(401);
  });

  it('unknown domain error falls through to 500', () => {
    class CustomError extends Error {
      constructor() { super('custom'); }
    }
    const { response, host } = mockHost();
    filter.catch(new CustomError(), host);
    expect(response._status).toBe(500);
    expect(response._body).toMatchObject({ error: { code: 'INTERNAL' } });
  });
});
```

- [ ] **Step 2: Implement filter**

`src/simulation/infrastructure/consumer/http/domain-exception.filter.ts`:
```typescript
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { InvalidStateError } from '@simulation/domain/errors/invalid-state.error';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';
import {
  SimulationNotFoundError,
  OwnershipMismatchError,
  ThrottledError,
  UnknownTokenError,
} from '@simulation/application/orchestrator/orchestrator.errors';

interface ErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly [key: string]: unknown;
  };
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status: (code: number) => { json: (body: ErrorBody) => void };
    }>();

    if (exception instanceof InvalidValueError) {
      response.status(400).json({
        error: {
          code: 'INVALID_VALUE',
          message: exception.message,
          field: exception.field,
          reason: exception.reason,
        },
      });
      return;
    }
    if (exception instanceof InvalidStateError) {
      response.status(409).json({
        error: {
          code: 'INVALID_STATE',
          message: exception.message,
          currentState: exception.currentState,
          attemptedAction: exception.attemptedAction,
        },
      });
      return;
    }
    if (exception instanceof SimulationNotFoundError) {
      response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: exception.message,
          simulationId: exception.simulationId,
        },
      });
      return;
    }
    if (exception instanceof OwnershipMismatchError) {
      response.status(403).json({
        error: { code: 'FORBIDDEN', message: exception.message },
      });
      return;
    }
    if (exception instanceof ThrottledError) {
      response.status(429).json({
        error: {
          code: 'THROTTLED',
          message: exception.message,
          cooldownMs: exception.cooldownMs,
        },
      });
      return;
    }
    if (exception instanceof UnknownTokenError) {
      response.status(401).json({
        error: { code: 'UNAUTHORIZED', message: exception.message },
      });
      return;
    }
    // Fallback — 500
    const message = exception instanceof Error ? exception.message : 'unknown error';
    response.status(500).json({
      error: { code: 'INTERNAL', message },
    });
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- domain-exception.filter.spec
npm run lint && npx tsc --noEmit
git add src/simulation/infrastructure/consumer/http/domain-exception.filter.ts test/unit/infrastructure/consumer/http/
git commit -m "feat(http): DomainExceptionFilter — maps domain errors to HTTP status codes

- InvalidValue → 400, InvalidState → 409, NotFound → 404, OwnershipMismatch → 403
- Throttled → 429, UnknownToken → 401, unknown Error → 500 (INTERNAL)
- Response body shape: { error: { code, message, ...fields } }
- 7 unit tests, mock ArgumentsHost"
```

---

## Task 6: SimulationController (REST endpoints)

**Files:**
- Create: `src/simulation/infrastructure/consumer/http/simulation.controller.ts`
- Create: `test/unit/infrastructure/consumer/http/simulation.controller.spec.ts`

- [ ] **Step 1: Failing tests (NestJS TestingModule with fake orchestrator)**

`test/unit/infrastructure/consumer/http/simulation.controller.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { SimulationController } from '@simulation/infrastructure/consumer/http/simulation.controller';
import { SimulationOrchestrator } from '@simulation/application/orchestrator/simulation-orchestrator';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import type { SimulationSnapshot } from '@simulation/domain/aggregates/simulation';

describe('SimulationController', () => {
  const simId = '550e8400-e29b-41d4-a716-446655440000';
  const token = '550e8400-e29b-41d4-a716-446655440010';
  const snapshot: SimulationSnapshot = {
    id: simId,
    ownerToken: token,
    name: 'Katar 2023',
    state: 'RUNNING',
    score: [],
    totalGoals: 0,
    startedAt: new Date('2026-04-18T12:00:00Z'),
    finishedAt: null,
    profileId: 'default',
  };

  async function buildControllerWith(orchestratorMock: Partial<SimulationOrchestrator>) {
    const module = await Test.createTestingModule({
      controllers: [SimulationController],
      providers: [
        { provide: SimulationOrchestrator, useValue: orchestratorMock },
      ],
    }).compile();
    return module.get(SimulationController);
  }

  it('POST /simulations without token issues new token', async () => {
    const started = {
      simulationId: simId,
      ownershipToken: token,
      state: 'RUNNING' as const,
      initialSnapshot: snapshot,
    };
    const ctrl = await buildControllerWith({
      startSimulation: jest.fn().mockResolvedValue(started),
    } as any);
    const result = await ctrl.create({ name: 'Katar 2023' } as any, undefined);
    expect(result.simulationId).toBe(simId);
    expect(result.ownershipToken).toBe(token);
  });

  it('POST /simulations forwards header token when present', async () => {
    const startSpy = jest.fn().mockResolvedValue({
      simulationId: simId,
      ownershipToken: token,
      state: 'RUNNING' as const,
      initialSnapshot: snapshot,
    });
    const ctrl = await buildControllerWith({ startSimulation: startSpy } as any);
    await ctrl.create({ name: 'Katar 2023' } as any, token);
    expect(startSpy).toHaveBeenCalledWith({
      name: 'Katar 2023',
      ownershipToken: expect.any(OwnershipToken),
    });
    const arg = startSpy.mock.calls[0][0];
    expect(arg.ownershipToken.value).toBe(token);
  });

  it('POST /simulations/:id/finish requires token header and forwards to orchestrator', async () => {
    const finishSpy = jest.fn().mockResolvedValue(undefined);
    const ctrl = await buildControllerWith({ finishSimulation: finishSpy } as any);
    await ctrl.finish(simId, token);
    expect(finishSpy).toHaveBeenCalledWith({
      simulationId: expect.any(SimulationId),
      ownershipToken: expect.any(OwnershipToken),
    });
  });

  it('POST /simulations/:id/restart requires token header', async () => {
    const restartSpy = jest.fn().mockResolvedValue(undefined);
    const ctrl = await buildControllerWith({ restartSimulation: restartSpy } as any);
    await ctrl.restart(simId, token);
    expect(restartSpy).toHaveBeenCalled();
  });

  it('GET /simulations returns orchestrator.listSimulations snapshot list', async () => {
    const listSpy = jest.fn().mockResolvedValue([snapshot]);
    const ctrl = await buildControllerWith({ listSimulations: listSpy } as any);
    const result = await ctrl.list();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(simId);
    expect(result[0].startedAt).toBe('2026-04-18T12:00:00.000Z');
  });

  it('GET /simulations/:id returns single', async () => {
    const getSpy = jest.fn().mockResolvedValue(snapshot);
    const ctrl = await buildControllerWith({ getSimulation: getSpy } as any);
    const result = await ctrl.get(simId);
    expect(result.id).toBe(simId);
  });
});
```

- [ ] **Step 2: Implement controller**

`src/simulation/infrastructure/consumer/http/simulation.controller.ts`:
```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Headers,
  HttpStatus,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { SimulationOrchestrator } from '@simulation/application/orchestrator/simulation-orchestrator';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { CreateSimulationRequestDto } from './dto/create-simulation.request';
import type { SimulationSnapshot } from '@simulation/domain/aggregates/simulation';
import { SIMULATION_TOKEN_HEADER } from './simulation-token.header';

interface SimulationResponseShape {
  id: string;
  name: string;
  state: 'RUNNING' | 'FINISHED';
  score: readonly { matchId: string; home: number; away: number }[];
  totalGoals: number;
  startedAt: string;
  finishedAt: string | null;
  profileId: string;
}

function toResponse(snap: SimulationSnapshot): SimulationResponseShape {
  return {
    id: snap.id,
    name: snap.name,
    state: snap.state,
    score: snap.score,
    totalGoals: snap.totalGoals,
    startedAt: snap.startedAt.toISOString(),
    finishedAt: snap.finishedAt ? snap.finishedAt.toISOString() : null,
    profileId: snap.profileId,
  };
}

@Controller('simulations')
export class SimulationController {
  constructor(private readonly orchestrator: SimulationOrchestrator) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateSimulationRequestDto,
    @Headers(SIMULATION_TOKEN_HEADER) token?: string,
  ): Promise<{
    simulationId: string;
    ownershipToken: string;
    state: 'RUNNING';
    initialSnapshot: SimulationResponseShape;
  }> {
    const ownershipToken = token ? OwnershipToken.create(token) : undefined;
    const result = await this.orchestrator.startSimulation({
      name: body.name,
      ownershipToken,
    });
    return {
      simulationId: result.simulationId,
      ownershipToken: result.ownershipToken,
      state: result.state,
      initialSnapshot: toResponse(result.initialSnapshot),
    };
  }

  @Post(':id/finish')
  @HttpCode(HttpStatus.ACCEPTED)
  async finish(
    @Param('id') id: string,
    @Headers(SIMULATION_TOKEN_HEADER) token: string | undefined,
  ): Promise<void> {
    if (!token) throw new UnauthorizedException(`Missing ${SIMULATION_TOKEN_HEADER} header`);
    await this.orchestrator.finishSimulation({
      simulationId: SimulationId.create(id),
      ownershipToken: OwnershipToken.create(token),
    });
  }

  @Post(':id/restart')
  @HttpCode(HttpStatus.ACCEPTED)
  async restart(
    @Param('id') id: string,
    @Headers(SIMULATION_TOKEN_HEADER) token: string | undefined,
  ): Promise<void> {
    if (!token) throw new UnauthorizedException(`Missing ${SIMULATION_TOKEN_HEADER} header`);
    await this.orchestrator.restartSimulation({
      simulationId: SimulationId.create(id),
      ownershipToken: OwnershipToken.create(token),
    });
  }

  @Get()
  async list(): Promise<SimulationResponseShape[]> {
    const all = await this.orchestrator.listSimulations();
    return all.map(toResponse);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<SimulationResponseShape> {
    const snap = await this.orchestrator.getSimulation(SimulationId.create(id));
    return toResponse(snap);
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- simulation.controller.spec
npm run lint && npx tsc --noEmit
git add src/simulation/infrastructure/consumer/http/simulation.controller.ts test/unit/infrastructure/consumer/http/simulation.controller.spec.ts
git commit -m "feat(http): SimulationController with 5 REST endpoints

- POST /simulations: issues token if absent, 201 with initialSnapshot
- POST /simulations/:id/finish: requires token, 202 (async finish via abort command)
- POST /simulations/:id/restart: requires token, 202 (resets + runs new cycle)
- GET /simulations: list all, maps SimulationSnapshot→JSON with ISO dates
- GET /simulations/:id: single, NotFound from orchestrator → 404 via filter
- 6 unit tests using TestingModule + mock orchestrator"
```

---

## Task 7: WebSocket gateway + event forwarder

**Files:**
- Create: `src/simulation/infrastructure/consumer/ws/simulation.gateway.ts`
- Create: `src/simulation/infrastructure/consumer/ws/ws-event-forwarder.ts`
- Create: `test/unit/infrastructure/consumer/ws/simulation.gateway.spec.ts`

The WS gateway accepts connections on `/simulations` namespace. Clients emit `subscribe` with `{simulationId}` and join room `simulation:{id}`. The `WsEventForwarder` subscribes to EventBus and broadcasts each domain event to the matching room.

- [ ] **Step 1: Failing tests**

`test/unit/infrastructure/consumer/ws/simulation.gateway.spec.ts`:
```typescript
import { SimulationGateway } from '@simulation/infrastructure/consumer/ws/simulation.gateway';
import { WsEventForwarder } from '@simulation/infrastructure/consumer/ws/ws-event-forwarder';
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import { InMemoryEventPublisher } from '@shared/messaging/in-memory-event-publisher';
import { GoalScored } from '@simulation/domain/events/goal-scored';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { TeamId } from '@simulation/domain/value-objects/team-id';

interface MockSocket {
  readonly id: string;
  readonly rooms: Set<string>;
  join(room: string): void;
  leave(room: string): void;
  emit(event: string, payload: unknown): void;
  _emitted: Array<{ event: string; payload: unknown }>;
}

function makeSocket(id: string): MockSocket {
  return {
    id,
    rooms: new Set(),
    _emitted: [],
    join(room) { this.rooms.add(room); },
    leave(room) { this.rooms.delete(room); },
    emit(event, payload) { this._emitted.push({ event, payload }); },
  };
}

interface MockServer {
  readonly rooms: Map<string, Set<MockSocket>>;
  to(room: string): { emit(event: string, payload: unknown): void };
}

function makeServer(): MockServer {
  const rooms = new Map<string, Set<MockSocket>>();
  return {
    rooms,
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          for (const socket of rooms.get(room) ?? []) {
            socket.emit(event, payload);
          }
        },
      };
    },
  };
}

describe('SimulationGateway', () => {
  it('handleSubscribe joins the client to simulation:{id} room', () => {
    const gateway = new SimulationGateway();
    const socket = makeSocket('client-1');
    gateway.handleSubscribe(socket as any, { simulationId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(socket.rooms.has('simulation:550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('handleSubscribe rejects bad simulationId format (not UUID)', () => {
    const gateway = new SimulationGateway();
    const socket = makeSocket('client-1');
    expect(() => gateway.handleSubscribe(socket as any, { simulationId: 'invalid' })).toThrow();
    expect(socket.rooms.size).toBe(0);
  });

  it('handleUnsubscribe leaves the room', () => {
    const gateway = new SimulationGateway();
    const socket = makeSocket('client-1');
    gateway.handleSubscribe(socket as any, { simulationId: '550e8400-e29b-41d4-a716-446655440000' });
    gateway.handleUnsubscribe(socket as any, { simulationId: '550e8400-e29b-41d4-a716-446655440000' });
    expect(socket.rooms.size).toBe(0);
  });
});

describe('WsEventForwarder', () => {
  it('broadcasts GoalScored to correct simulation room', async () => {
    const bus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(bus);
    const server = makeServer();
    const forwarder = new WsEventForwarder(bus, () => server as any);
    forwarder.start();

    const simId = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
    const socket = makeSocket('client-1');
    server.rooms.set('simulation:' + simId.value, new Set([socket]));

    await publisher.publish(new GoalScored(simId, TeamId.create('germany'), [{ matchId: 'm1', home: 1, away: 0 }], 1, new Date('2026-04-18T12:00:01Z')));

    expect(socket._emitted).toHaveLength(1);
    expect(socket._emitted[0].event).toBe('goal-scored');
    expect(socket._emitted[0].payload).toMatchObject({
      simulationId: simId.value,
      teamId: 'germany',
      totalGoals: 1,
    });

    await forwarder.stop();
  });

  it('does not broadcast to clients in other rooms', async () => {
    const bus = new InMemoryEventBus();
    const publisher = new InMemoryEventPublisher(bus);
    const server = makeServer();
    const forwarder = new WsEventForwarder(bus, () => server as any);
    forwarder.start();

    const simId1 = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
    const simId2 = SimulationId.create('550e8400-e29b-41d4-a716-446655440001');
    const s1 = makeSocket('c1');
    const s2 = makeSocket('c2');
    server.rooms.set('simulation:' + simId1.value, new Set([s1]));
    server.rooms.set('simulation:' + simId2.value, new Set([s2]));

    await publisher.publish(new GoalScored(simId1, TeamId.create('germany'), [], 1, new Date()));
    expect(s1._emitted).toHaveLength(1);
    expect(s2._emitted).toHaveLength(0);

    await forwarder.stop();
  });
});
```

- [ ] **Step 2: Implement gateway**

`src/simulation/infrastructure/consumer/ws/simulation.gateway.ts`:
```typescript
import {
  MessageBody,
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { z } from 'zod';

const SubscribeSchema = z.object({
  simulationId: z.string().uuid(),
});

type SubscribePayload = z.infer<typeof SubscribeSchema>;

function roomName(simulationId: string): string {
  return `simulation:${simulationId}`;
}

interface GatewaySocket {
  readonly id: string;
  join(room: string): void;
  leave(room: string): void;
}

@WebSocketGateway({ namespace: '/simulations', cors: true })
export class SimulationGateway {
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody() payload: unknown,
  ): { ok: true } {
    const parsed: SubscribePayload = SubscribeSchema.parse(payload);
    client.join(roomName(parsed.simulationId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: GatewaySocket,
    @MessageBody() payload: unknown,
  ): { ok: true } {
    const parsed: SubscribePayload = SubscribeSchema.parse(payload);
    client.leave(roomName(parsed.simulationId));
    return { ok: true };
  }
}

export { roomName };
```

- [ ] **Step 3: Implement WsEventForwarder**

`src/simulation/infrastructure/consumer/ws/ws-event-forwarder.ts`:
```typescript
import type { EventBus } from '@shared/messaging/event-bus.port';
import type { Subscription } from '@shared/messaging/command-bus.port';
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import { roomName } from './simulation.gateway';

interface BroadcastServer {
  to(room: string): { emit(event: string, payload: unknown): void };
}

const EVENT_NAME_BY_TYPE: Record<string, string> = {
  SimulationStarted: 'simulation-started',
  GoalScored: 'goal-scored',
  SimulationFinished: 'simulation-finished',
  SimulationRestarted: 'simulation-restarted',
};

function eventPayload(event: DomainEvent): Record<string, unknown> {
  // Generic shallow serialization — VOs implement toJSON
  return JSON.parse(JSON.stringify(event));
}

export class WsEventForwarder {
  private subscription: Subscription | null = null;

  constructor(
    private readonly eventBus: EventBus,
    private readonly getServer: () => BroadcastServer,
  ) {}

  start(): void {
    this.subscription = this.eventBus.subscribe(
      () => true,
      async (event, meta) => {
        if (!meta.simulationId) return;
        const wsEventName = EVENT_NAME_BY_TYPE[event.type];
        if (!wsEventName) return;
        this.getServer()
          .to(roomName(meta.simulationId))
          .emit(wsEventName, eventPayload(event));
      },
    );
  }

  async stop(): Promise<void> {
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
    }
  }
}
```

- [ ] **Step 4: Run + commit**

```bash
npm test -- simulation.gateway.spec
npm run lint && npx tsc --noEmit
git add src/simulation/infrastructure/consumer/ws/ test/unit/infrastructure/consumer/ws/
git commit -m "feat(ws): SimulationGateway + WsEventForwarder

- Gateway @WebSocketGateway on /simulations namespace with subscribe/unsubscribe handlers
  (Zod-validated payload, joins/leaves room 'simulation:{id}')
- WsEventForwarder subscribes to EventBus, maps DomainEvent.type → WS event name,
  broadcasts to matching room via getServer().to(room).emit(...)
- 5 unit tests covering gateway handlers and forwarder routing"
```

---

## Task 8: Module wiring (SimulationModule + OwnershipModule + AppModule + main.ts)

**Files:**
- Create: `src/ownership/ownership.module.ts`
- Create: `src/simulation/simulation.module.ts`
- Modify: `src/app.module.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Create OwnershipModule**

`src/ownership/ownership.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { InMemoryOwnershipRepository } from '@ownership/infrastructure/in-memory-ownership.repository';
import { UuidOwnershipTokenGenerator } from '@ownership/infrastructure/uuid-ownership-token.generator';

@Module({
  providers: [
    { provide: PORT_TOKENS.OWNERSHIP_REPOSITORY, useClass: InMemoryOwnershipRepository },
    {
      provide: PORT_TOKENS.OWNERSHIP_TOKEN_GENERATOR,
      useFactory: (random) => new UuidOwnershipTokenGenerator(random),
      inject: [PORT_TOKENS.RANDOM_PROVIDER],
    },
  ],
  exports: [PORT_TOKENS.OWNERSHIP_REPOSITORY, PORT_TOKENS.OWNERSHIP_TOKEN_GENERATOR],
})
export class OwnershipModule {}
```

- [ ] **Step 2: Create SimulationModule**

`src/simulation/simulation.module.ts`:
```typescript
import { APP_FILTER } from '@nestjs/core';
import { Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '@shared/config/config.schema';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { OwnershipModule } from '@ownership/ownership.module';
import { SystemClock } from '@simulation/infrastructure/time/system-clock';
import { CryptoRandomProvider } from '@simulation/infrastructure/random/crypto-random-provider';
import { InMemorySimulationRepository } from '@simulation/infrastructure/persistence/in-memory-simulation.repository';
import { UniformRandomGoalDynamics } from '@simulation/infrastructure/dynamics/uniform-random-goal-dynamics';
import { TickingSimulationEngine } from '@simulation/infrastructure/engine/ticking-simulation-engine';
import { FiveSecondCooldownPolicy } from '@simulation/infrastructure/policies/five-second-cooldown.policy';
import { TtlRetentionPolicy } from '@simulation/infrastructure/policies/ttl-retention.policy';
import { InMemoryCommandBus } from '@shared/messaging/in-memory-command-bus';
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import { InMemoryEventPublisher } from '@shared/messaging/in-memory-event-publisher';
import { SimulationOrchestrator } from '@simulation/application/orchestrator/simulation-orchestrator';
import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';
import { SimulationController } from '@simulation/infrastructure/consumer/http/simulation.controller';
import { DomainExceptionFilter } from '@simulation/infrastructure/consumer/http/domain-exception.filter';
import { SimulationGateway } from '@simulation/infrastructure/consumer/ws/simulation.gateway';
import { WsEventForwarder } from '@simulation/infrastructure/consumer/ws/ws-event-forwarder';
import type { SimulationConfig } from '@simulation/domain/simulation-config';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { Clock } from '@simulation/domain/ports/clock.port';
import type { MatchDynamics } from '@simulation/domain/ports/match-dynamics.port';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { EventPublisher } from '@simulation/domain/ports/event-publisher.port';
import type { SimulationEngine } from '@simulation/domain/ports/simulation-engine.port';
import type { CommandBus } from '@shared/messaging/command-bus.port';
import type { EventBus } from '@shared/messaging/event-bus.port';
import type { OwnershipRepository } from '@ownership/domain/ports/ownership-repository.port';
import type { OwnershipTokenGenerator } from '@ownership/domain/ports/ownership-token-generator.port';
import type { ThrottlePolicy } from '@simulation/domain/ports/throttle-policy.port';

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
  imports: [OwnershipModule],
  controllers: [SimulationController],
  providers: [
    { provide: PORT_TOKENS.CLOCK, useClass: SystemClock },
    { provide: PORT_TOKENS.RANDOM_PROVIDER, useClass: CryptoRandomProvider },
    { provide: PORT_TOKENS.SIMULATION_REPOSITORY, useClass: InMemorySimulationRepository },
    { provide: PORT_TOKENS.COMMAND_BUS, useClass: InMemoryCommandBus },
    { provide: PORT_TOKENS.EVENT_BUS, useClass: InMemoryEventBus },
    {
      provide: PORT_TOKENS.EVENT_PUBLISHER,
      useFactory: (bus: EventBus) => new InMemoryEventPublisher(bus),
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
      useFactory: (clock: Clock, dynamics: MatchDynamics) => new TickingSimulationEngine(clock, dynamics),
      inject: [PORT_TOKENS.CLOCK, PORT_TOKENS.MATCH_DYNAMICS],
    },
    {
      provide: PORT_TOKENS.THROTTLE_POLICY,
      useFactory: (config: ConfigService<AppConfig, true>) =>
        new FiveSecondCooldownPolicy(config.get('START_COOLDOWN_MS', { infer: true })),
      inject: [ConfigService],
    },
    {
      provide: PORT_TOKENS.RETENTION_POLICY,
      useFactory: (config: ConfigService<AppConfig, true>) =>
        new TtlRetentionPolicy(config.get('FINISHED_RETENTION_MS', { infer: true })),
      inject: [ConfigService],
    },
    {
      provide: SimulationOrchestrator,
      useFactory: (
        simRepo: SimulationRepository,
        ownerRepo: OwnershipRepository,
        tokenGen: OwnershipTokenGenerator,
        throttle: ThrottlePolicy,
        cmdBus: CommandBus,
        publisher: EventPublisher,
        clock: Clock,
        config: ConfigService<AppConfig, true>,
      ) =>
        new SimulationOrchestrator({
          simulationRepository: simRepo,
          ownershipRepository: ownerRepo,
          tokenGenerator: tokenGen,
          throttlePolicy: throttle,
          commandBus: cmdBus,
          eventPublisher: publisher,
          clock,
          config: configFromEnv(config),
          defaultProfileId: DEFAULT_PROFILE_ID,
        }),
      inject: [
        PORT_TOKENS.SIMULATION_REPOSITORY,
        PORT_TOKENS.OWNERSHIP_REPOSITORY,
        PORT_TOKENS.OWNERSHIP_TOKEN_GENERATOR,
        PORT_TOKENS.THROTTLE_POLICY,
        PORT_TOKENS.COMMAND_BUS,
        PORT_TOKENS.EVENT_PUBLISHER,
        PORT_TOKENS.CLOCK,
        ConfigService,
      ],
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
    SimulationGateway,
    {
      provide: WsEventForwarder,
      useFactory: (bus: EventBus, gateway: SimulationGateway) =>
        new WsEventForwarder(bus, () => (gateway as unknown as { server: { to: (r: string) => { emit: (e: string, p: unknown) => void } } }).server),
      inject: [PORT_TOKENS.EVENT_BUS, SimulationGateway],
    },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
  exports: [SimulationOrchestrator, SimulationWorkerHandler, WsEventForwarder, SimulationGateway],
})
export class SimulationModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly worker: SimulationWorkerHandler,
    private readonly forwarder: WsEventForwarder,
  ) {}

  onModuleInit(): void {
    this.worker.subscribe();
    this.forwarder.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.shutdown();
    await this.forwarder.stop();
  }
}
```

**Note on `SimulationGateway.server`**: NestJS `@WebSocketServer()` decorator auto-assigns the Socket.IO server instance to a property when the gateway is instantiated. We access it at runtime via `(gateway as any).server`. Add `@WebSocketServer() server!: Server` field to the gateway class:

Modify `src/simulation/infrastructure/consumer/ws/simulation.gateway.ts` — add `WebSocketServer` import and field:
```typescript
import { WebSocketServer, MessageBody, ConnectedSocket, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { Server } from 'socket.io';
// ... at top of class body:
@WebSocketGateway({ namespace: '/simulations', cors: true })
export class SimulationGateway {
  @WebSocketServer()
  server!: Server;
  // ... existing @SubscribeMessage handlers
}
```

- [ ] **Step 3: Modify `src/app.module.ts`**

`src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';
import { SimulationModule } from './simulation/simulation.module';

@Module({
  imports: [AppConfigModule, SimulationModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 4: Modify `src/main.ts` — enable WS adapter + shutdown hooks**

`src/main.ts`:
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
  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  // TODO(phase-6): replace with Pino logger.
  // eslint-disable-next-line no-console
  console.log(`Application is running on port ${port}`);
}

void bootstrap();
```

- [ ] **Step 5: Run build + lint + commit**

```bash
npm run build 2>&1 | tail -10
npm run lint && npx tsc --noEmit
git add src/simulation/simulation.module.ts src/ownership/ownership.module.ts src/app.module.ts src/main.ts src/simulation/infrastructure/consumer/ws/simulation.gateway.ts
git commit -m "feat(nest): wire SimulationModule + OwnershipModule + WS adapter + shutdown hooks

- OwnershipModule provides OWNERSHIP_REPOSITORY + OWNERSHIP_TOKEN_GENERATOR
- SimulationModule provides all 12 ports + Orchestrator + WorkerHandler +
  Gateway + WsEventForwarder + DomainExceptionFilter (via APP_FILTER)
- onModuleInit subscribes worker to CommandBus and starts event forwarder
- onModuleDestroy drains in-flight runs and stops forwarder
- AppModule imports SimulationModule
- main.ts: IoAdapter for WebSockets, ZodValidationPipe global, shutdown hooks,
  PORT from typed ConfigService"
```

---

## Task 9: Integration test — HTTP full lifecycle (start → auto-finish)

**Files:**
- Create: `test/integration/http-lifecycle.e2e-spec.ts`

Integration test builds full NestJS app with FakeClock + SeededRandom overrides, sends HTTP requests via supertest, advances clock, asserts final state via GET /simulations/:id.

- [ ] **Step 1: Write integration test**

`test/integration/http-lifecycle.e2e-spec.ts`:
```typescript
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';

async function tickTo(clock: FakeClock, totalMs: number): Promise<void> {
  for (let i = 0; i < totalMs; i += 1) await clock.advance(1);
}

describe('HTTP lifecycle — start → 9 goals → auto-finish', () => {
  let app: INestApplication;
  let module: TestingModule;
  let clock: FakeClock;
  let worker: SimulationWorkerHandler;

  beforeEach(async () => {
    module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PORT_TOKENS.CLOCK)
      .useValue(new FakeClock(new Date('2026-04-18T12:00:00Z')))
      .overrideProvider(PORT_TOKENS.RANDOM_PROVIDER)
      .useValue(new SeededRandomProvider(42))
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();

    clock = module.get(PORT_TOKENS.CLOCK) as FakeClock;
    worker = module.get(SimulationWorkerHandler);
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /simulations creates running simulation with 201 + ownership token', async () => {
    const response = await request(app.getHttpServer())
      .post('/simulations')
      .send({ name: 'Katar 2023' })
      .expect(201);

    expect(response.body.simulationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.ownershipToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.state).toBe('RUNNING');
    expect(response.body.initialSnapshot.totalGoals).toBe(0);
  });

  it('full flow: start → 9 goals elapse → auto-finish, totalGoals=9 state=FINISHED', async () => {
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .send({ name: 'Katar 2023' })
      .expect(201);
    const simId = created.body.simulationId;

    // Advance clock by 10 simulated seconds
    await tickTo(clock, 10_000);
    await worker.drainInFlight();

    const finalState = await request(app.getHttpServer())
      .get(`/simulations/${simId}`)
      .expect(200);
    expect(finalState.body.state).toBe('FINISHED');
    expect(finalState.body.totalGoals).toBe(9);
    expect(finalState.body.finishedAt).not.toBeNull();
  });

  it('GET /simulations lists created simulations', async () => {
    await request(app.getHttpServer()).post('/simulations').send({ name: 'Katar 2023' }).expect(201);
    const list = await request(app.getHttpServer()).get('/simulations').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].state).toBe('RUNNING');
  });
});
```

- [ ] **Step 2: Adjust tsconfig path map for `@/app.module` (single-file aliasing)**

If `@/app.module` doesn't resolve, use relative path instead:
```typescript
import { AppModule } from '../../src/app.module';
```

Apply this fallback if the `@/` alias isn't configured. It's not — plan uses `@simulation/*`, `@ownership/*`, `@shared/*`. So use relative: `import { AppModule } from '../../src/app.module';`.

Fix the import accordingly.

- [ ] **Step 3: Run + commit**

```bash
npm test -- http-lifecycle.e2e-spec
npm run lint && npx tsc --noEmit
git add test/integration/http-lifecycle.e2e-spec.ts
git commit -m "test(integration): HTTP full lifecycle — start → 9 goals → auto-finish

- Test harness overrides CLOCK + RANDOM_PROVIDER in NestJS TestingModule
- Tests: POST 201 shape, full-flow asserts FINISHED + totalGoals=9, GET list
- Uses FakeClock.advance(1) + worker.drainInFlight() for deterministic timing"
```

---

## Task 10: Integration tests — manual finish + restart + throttle + validation

**Files:**
- Create: `test/integration/http-manual-finish.e2e-spec.ts`
- Create: `test/integration/http-restart.e2e-spec.ts`
- Create: `test/integration/http-throttle-validation.e2e-spec.ts`

Identical setup pattern as Task 9 (`beforeEach` building app with FakeClock + SeededRandom overrides). Each file tests one flow.

- [ ] **Step 1: http-manual-finish.e2e-spec.ts**

`test/integration/http-manual-finish.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';

async function tickTo(clock: FakeClock, totalMs: number): Promise<void> {
  for (let i = 0; i < totalMs; i += 1) await clock.advance(1);
}

describe('HTTP manual finish mid-simulation', () => {
  let app: INestApplication;
  let clock: FakeClock;
  let worker: SimulationWorkerHandler;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PORT_TOKENS.CLOCK)
      .useValue(new FakeClock(new Date('2026-04-18T12:00:00Z')))
      .overrideProvider(PORT_TOKENS.RANDOM_PROVIDER)
      .useValue(new SeededRandomProvider(42))
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    clock = module.get(PORT_TOKENS.CLOCK) as FakeClock;
    worker = module.get(SimulationWorkerHandler);
  });

  afterEach(async () => {
    await app.close();
  });

  it('finish before 9s elapses → state FINISHED with reason=manual, fewer goals', async () => {
    const created = await request(app.getHttpServer()).post('/simulations').send({ name: 'Katar 2023' }).expect(201);
    const { simulationId, ownershipToken } = created.body;

    await tickTo(clock, 3000);
    await request(app.getHttpServer())
      .post(`/simulations/${simulationId}/finish`)
      .set('x-simulation-token', ownershipToken)
      .expect(202);
    await worker.drainInFlight();

    const final = await request(app.getHttpServer()).get(`/simulations/${simulationId}`).expect(200);
    expect(final.body.state).toBe('FINISHED');
    expect(final.body.totalGoals).toBeLessThan(9);
  });

  it('finish without token → 401 UNAUTHORIZED', async () => {
    const created = await request(app.getHttpServer()).post('/simulations').send({ name: 'Katar 2023' }).expect(201);
    await request(app.getHttpServer()).post(`/simulations/${created.body.simulationId}/finish`).expect(401);
  });

  it('finish with wrong token → 403 FORBIDDEN', async () => {
    const created = await request(app.getHttpServer()).post('/simulations').send({ name: 'Katar 2023' }).expect(201);
    const bogus = '550e8400-e29b-41d4-a716-999999999999';
    await request(app.getHttpServer())
      .post(`/simulations/${created.body.simulationId}/finish`)
      .set('x-simulation-token', bogus)
      .expect(401); // UnknownToken → 401
  });

  it('finish on unknown simulationId → 404 NOT_FOUND', async () => {
    const unknown = '550e8400-e29b-41d4-a716-111111111111';
    const created = await request(app.getHttpServer()).post('/simulations').send({ name: 'Katar 2023' }).expect(201);
    await request(app.getHttpServer())
      .post(`/simulations/${unknown}/finish`)
      .set('x-simulation-token', created.body.ownershipToken)
      .expect(404);
  });
});
```

- [ ] **Step 2: http-restart.e2e-spec.ts**

`test/integration/http-restart.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';

async function tickTo(clock: FakeClock, totalMs: number): Promise<void> {
  for (let i = 0; i < totalMs; i += 1) await clock.advance(1);
}

describe('HTTP restart flow', () => {
  let app: INestApplication;
  let clock: FakeClock;
  let worker: SimulationWorkerHandler;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PORT_TOKENS.CLOCK)
      .useValue(new FakeClock(new Date('2026-04-18T12:00:00Z')))
      .overrideProvider(PORT_TOKENS.RANDOM_PROVIDER)
      .useValue(new SeededRandomProvider(42))
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    clock = module.get(PORT_TOKENS.CLOCK) as FakeClock;
    worker = module.get(SimulationWorkerHandler);
  });

  afterEach(async () => {
    await app.close();
  });

  it('restart after auto-finish → score reset, state RUNNING again', async () => {
    const created = await request(app.getHttpServer()).post('/simulations').send({ name: 'Katar 2023' }).expect(201);
    const { simulationId, ownershipToken } = created.body;

    // Let first run finish naturally
    await tickTo(clock, 10_000);
    await worker.drainInFlight();

    // Past 5s cooldown already; restart
    await request(app.getHttpServer())
      .post(`/simulations/${simulationId}/restart`)
      .set('x-simulation-token', ownershipToken)
      .expect(202);

    const afterRestart = await request(app.getHttpServer()).get(`/simulations/${simulationId}`).expect(200);
    expect(afterRestart.body.state).toBe('RUNNING');
    expect(afterRestart.body.totalGoals).toBe(0);

    // Run second 9s
    await tickTo(clock, 10_000);
    await worker.drainInFlight();
    const afterSecond = await request(app.getHttpServer()).get(`/simulations/${simulationId}`).expect(200);
    expect(afterSecond.body.state).toBe('FINISHED');
    expect(afterSecond.body.totalGoals).toBe(9);
  });

  it('restart when RUNNING → 409 INVALID_STATE', async () => {
    const created = await request(app.getHttpServer()).post('/simulations').send({ name: 'Katar 2023' }).expect(201);
    const { simulationId, ownershipToken } = created.body;
    await tickTo(clock, 3000); // still RUNNING
    await request(app.getHttpServer())
      .post(`/simulations/${simulationId}/restart`)
      .set('x-simulation-token', ownershipToken)
      .expect(409);
  });
});
```

- [ ] **Step 3: http-throttle-validation.e2e-spec.ts**

`test/integration/http-throttle-validation.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';

describe('HTTP throttle + validation', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PORT_TOKENS.CLOCK)
      .useValue(new FakeClock(new Date('2026-04-18T12:00:00Z')))
      .overrideProvider(PORT_TOKENS.RANDOM_PROVIDER)
      .useValue(new SeededRandomProvider(42))
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('second start within 5s with same token → 429 THROTTLED', async () => {
    const first = await request(app.getHttpServer()).post('/simulations').send({ name: 'Katar 2023' }).expect(201);
    await request(app.getHttpServer())
      .post('/simulations')
      .set('x-simulation-token', first.body.ownershipToken)
      .send({ name: 'Paryz 2024' })
      .expect(429);
  });

  it('name shorter than 8 chars → 400 INVALID_VALUE', async () => {
    await request(app.getHttpServer()).post('/simulations').send({ name: 'Short' }).expect(400);
  });

  it('name with special characters → 400', async () => {
    await request(app.getHttpServer()).post('/simulations').send({ name: 'Katar-2023' }).expect(400);
  });

  it('name longer than 30 → 400', async () => {
    await request(app.getHttpServer()).post('/simulations').send({ name: 'A'.repeat(31) }).expect(400);
  });

  it('malformed JSON body → 400', async () => {
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Content-Type', 'application/json')
      .send('not-json')
      .expect(400);
  });
});
```

- [ ] **Step 4: Run all three + commit**

```bash
npm test -- http-manual-finish.e2e-spec http-restart.e2e-spec http-throttle-validation.e2e-spec
npm run lint && npx tsc --noEmit
git add test/integration/http-manual-finish.e2e-spec.ts test/integration/http-restart.e2e-spec.ts test/integration/http-throttle-validation.e2e-spec.ts
git commit -m "test(integration): manual finish + restart + throttle + validation

- http-manual-finish: finish mid-run, missing token 401, wrong token 401, not found 404
- http-restart: full cycle restart after auto-finish, 409 when RUNNING
- http-throttle-validation: 429 on 5s reuse, 400 on invalid name lengths + chars
- Each spec file builds its own TestingModule with FakeClock + SeededRandom overrides"
```

---

## Task 11: E2E WebSocket tests

**Files:**
- Create: `test/e2e/ws-goal-observer.e2e-spec.ts`
- Create: `test/e2e/ws-multi-observer.e2e-spec.ts`

WebSocket E2E uses `socket.io-client`. Connects to server (listens on ephemeral port), subscribes to a simulation, advances FakeClock, asserts events received.

- [ ] **Step 1: ws-goal-observer.e2e-spec.ts**

`test/e2e/ws-goal-observer.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AddressInfo } from 'node:net';
import { AppModule } from '../../src/app.module';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';

async function tickTo(clock: FakeClock, totalMs: number): Promise<void> {
  for (let i = 0; i < totalMs; i += 1) await clock.advance(1);
}

describe('E2E WebSocket — observer receives goal events', () => {
  let app: INestApplication;
  let clock: FakeClock;
  let worker: SimulationWorkerHandler;
  let wsUrl: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PORT_TOKENS.CLOCK)
      .useValue(new FakeClock(new Date('2026-04-18T12:00:00Z')))
      .overrideProvider(PORT_TOKENS.RANDOM_PROVIDER)
      .useValue(new SeededRandomProvider(42))
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    await app.listen(0); // ephemeral port

    const server = app.getHttpServer();
    const address = server.address() as AddressInfo;
    wsUrl = `http://127.0.0.1:${address.port}/simulations`;

    clock = module.get(PORT_TOKENS.CLOCK) as FakeClock;
    worker = module.get(SimulationWorkerHandler);
  });

  afterEach(async () => {
    await app.close();
  });

  it('subscribes to simulation and receives 9 goal-scored events + simulation-finished', async () => {
    const created = await request(app.getHttpServer()).post('/simulations').send({ name: 'Katar 2023' }).expect(201);
    const simId = created.body.simulationId;

    const socket: Socket = io(wsUrl, { transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', reject);
    });
    const goals: Array<{ totalGoals: number }> = [];
    const finishes: Array<{ reason: string }> = [];
    socket.on('goal-scored', (payload) => goals.push(payload));
    socket.on('simulation-finished', (payload) => finishes.push(payload));

    await new Promise<void>((resolve, reject) => {
      socket.emit('subscribe', { simulationId: simId }, (ack: unknown) => {
        if ((ack as { ok: boolean }).ok) resolve();
        else reject(new Error('subscribe nack'));
      });
    });

    await tickTo(clock, 10_000);
    await worker.drainInFlight();

    // Allow event loop to flush WS deliveries
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(goals).toHaveLength(9);
    expect(finishes).toHaveLength(1);
    expect(finishes[0].reason).toBe('auto');
    socket.disconnect();
  }, 10_000);
});
```

- [ ] **Step 2: ws-multi-observer.e2e-spec.ts**

`test/e2e/ws-multi-observer.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { AddressInfo } from 'node:net';
import { AppModule } from '../../src/app.module';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';

async function tickTo(clock: FakeClock, totalMs: number): Promise<void> {
  for (let i = 0; i < totalMs; i += 1) await clock.advance(1);
}

describe('E2E WebSocket — multi-observer broadcast', () => {
  let app: INestApplication;
  let clock: FakeClock;
  let worker: SimulationWorkerHandler;
  let wsUrl: string;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PORT_TOKENS.CLOCK)
      .useValue(new FakeClock(new Date('2026-04-18T12:00:00Z')))
      .overrideProvider(PORT_TOKENS.RANDOM_PROVIDER)
      .useValue(new SeededRandomProvider(42))
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    wsUrl = `http://127.0.0.1:${address.port}/simulations`;
    clock = module.get(PORT_TOKENS.CLOCK) as FakeClock;
    worker = module.get(SimulationWorkerHandler);
  });

  afterEach(async () => {
    await app.close();
  });

  it('two observers on same simulation both receive 9 goals', async () => {
    const created = await request(app.getHttpServer()).post('/simulations').send({ name: 'Katar 2023' }).expect(201);
    const simId = created.body.simulationId;

    async function buildObserver(): Promise<{ socket: Socket; goals: number[] }> {
      const socket = io(wsUrl, { transports: ['websocket'], reconnection: false });
      await new Promise<void>((resolve, reject) => {
        socket.on('connect', () => resolve());
        socket.on('connect_error', reject);
      });
      const goals: number[] = [];
      socket.on('goal-scored', (p: { totalGoals: number }) => goals.push(p.totalGoals));
      await new Promise<void>((resolve) => {
        socket.emit('subscribe', { simulationId: simId }, () => resolve());
      });
      return { socket, goals };
    }

    const a = await buildObserver();
    const b = await buildObserver();

    await tickTo(clock, 10_000);
    await worker.drainInFlight();
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(a.goals).toHaveLength(9);
    expect(b.goals).toHaveLength(9);
    a.socket.disconnect();
    b.socket.disconnect();
  }, 10_000);
});
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- ws-goal-observer.e2e-spec ws-multi-observer.e2e-spec
npm run lint && npx tsc --noEmit
git add test/e2e/
git commit -m "test(e2e): WebSocket observer flows — single + multi-observer

- Boots real NestJS app on ephemeral port, uses socket.io-client
- Single observer: receives 9 goal-scored + 1 simulation-finished(auto)
- Two observers on same sim: both receive full 9-goal stream
- Connect-ack handshake ensures subscription is ready before clock advances"
```

---

## Task 12: README — req-to-test mapping update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace Phase 0 status line and add req-to-test section**

Modify `README.md`. Replace `**Status**: Phase 0 (scaffolding) — struktura projektu gotowa, domain logic w Phase 1.` with:

```markdown
**Status**: Phase 1 MVP complete (tag `v1.0-mvp-in-process`).
```

Insert new section before `## Architecture`:

```markdown
## Requirements → Test mapping

Pełny spec wymagań z PDFa: `TS-Coding-task.pdf` (gitignored lokalnie). Każde z 7 requirements jest pokryte explicit testem:

| Req # | Wymaganie | Test file |
|---|---|---|
| 1 | Start / Finish / Restart | `test/integration/http-lifecycle.e2e-spec.ts`, `test/integration/http-manual-finish.e2e-spec.ts`, `test/integration/http-restart.e2e-spec.ts` |
| 2 | Name 8-30 znaków, Unicode letters/digits/spaces | `test/unit/domain/value-objects/simulation-name.spec.ts` + `test/integration/http-throttle-validation.e2e-spec.ts` |
| 3 | Start nie częściej niż raz na 5s | `test/unit/infrastructure/policies/five-second-cooldown.policy.spec.ts` + `test/integration/http-throttle-validation.e2e-spec.ts` |
| 4 | 9 sekund, auto-stop | `test/integration/simulation-engine-end-to-end.spec.ts` + `test/integration/http-lifecycle.e2e-spec.ts` |
| 5 | Manual finish przed 9s | `test/integration/http-manual-finish.e2e-spec.ts` |
| 6 | Gol co 1s, losowa drużyna, 9 total, push events | `test/unit/infrastructure/dynamics/uniform-random-goal-dynamics.spec.ts` + `test/e2e/ws-goal-observer.e2e-spec.ts` |
| 7 | Restart resetuje wyniki | `test/unit/domain/aggregates/simulation.spec.ts` + `test/integration/http-restart.e2e-spec.ts` |

Additional coverage:
- Multi-observer WS broadcast: `test/e2e/ws-multi-observer.e2e-spec.ts`
- Ownership/authorization: `test/integration/http-manual-finish.e2e-spec.ts`
- All domain invariants: `test/unit/domain/aggregates/simulation.spec.ts`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README req→test mapping + Phase 1 MVP status"
```

---

## Task 13: CHANGELOG Phase 1c entry + git tag v1.0-mvp-in-process

- [ ] **Step 1: Append CHANGELOG Phase 1c entry**

Modify `CHANGELOG.md`, insert under `## [Unreleased]`:

```markdown
### Added (Phase 1c — application + gateway, 2026-04-18)
- Application layer: `SimulationOrchestrator` (5 use cases: start/finish/restart/list/get), `SimulationWorkerHandler` (CommandBus subscriber with AbortController per-simulation management), command types `RunSimulationCommand` + `AbortSimulationCommand` + topic constants
- Orchestrator errors: `SimulationNotFoundError`, `OwnershipMismatchError`, `ThrottledError`, `UnknownTokenError`
- Consumer Gateway HTTP:
  - Zod DTOs (`CreateSimulationRequest`, `SimulationResponse`, `StartedResponse`) via `nestjs-zod`
  - `SimulationController` — 5 endpoints (POST, GET list, GET by id, finish, restart)
  - `DomainExceptionFilter` mapping domain errors to HTTP codes (400/401/403/404/409/429)
  - `SIMULATION_TOKEN_HEADER` constant
- Consumer Gateway WebSocket (namespace `/simulations`):
  - `SimulationGateway` with `subscribe`/`unsubscribe` handlers, Zod-validated payload
  - `WsEventForwarder` subscribing to EventBus and broadcasting to `simulation:{id}` rooms
  - Event names: `simulation-started`, `goal-scored`, `simulation-finished`, `simulation-restarted`
- Module wiring: `OwnershipModule`, `SimulationModule` with onModuleInit (worker + forwarder start) and onModuleDestroy (shutdown)
- `main.ts`: typed `ConfigService<AppConfig>` for port, `IoAdapter` + `ZodValidationPipe` global + shutdown hooks
- Integration tests (HTTP + FakeClock):
  - Full lifecycle (start → 9 goals → auto-finish)
  - Manual finish mid-simulation + token variants (missing/wrong/unknown sim)
  - Restart flow + INVALID_STATE on RUNNING
  - Throttle 5s + name validation edge cases
- E2E WebSocket tests (real `socket.io-client`):
  - Single observer receives 9 goals + finish event
  - Multi-observer broadcast (2 clients, same stream)
- README req→test mapping table (7 PDF requirements mapped)

### Tagged
- `v1.0-mvp-in-process`
```

Also move prior Phase 1a/1b entries out of `[Unreleased]` into a `## [1.0.0] — 2026-04-18` section that includes all of Phase 1a + 1b + 1c. Clean structure:

```markdown
## [Unreleased]

## [1.0.0] — 2026-04-18

### Phase 1c — application + gateway
(bullets above)

### Phase 1b — infrastructure adapters
(existing 1b bullets)

### Phase 1a — domain layer
(existing 1a bullets)

### Tagged
- `v1.0-mvp-in-process`
```

(You MAY use your judgment to consolidate; goal is clear history.)

- [ ] **Step 2: Commit CHANGELOG**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG consolidated Phase 1 (a+b+c) entry for v1.0.0"
```

- [ ] **Step 3: Run full gate suite before tag**

```bash
npm run format:check && npm run lint && npx tsc --noEmit && npm test && npm run build
docker build -t sportradar-simulation:v1.0 -q . && docker run --rm -d -p 3000:3000 --name sportradar-v1 sportradar-simulation:v1.0
sleep 3
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/simulations
curl -sS -X POST http://localhost:3000/simulations -H 'Content-Type: application/json' -d '{"name":"Katar 2023"}' | head -c 200
docker stop sportradar-v1
```
Expected: all gates green. Docker smoke: GET /simulations returns 200 with `[]`, POST returns JSON with simulationId/ownershipToken.

- [ ] **Step 4: Git tag**

```bash
git tag -a v1.0-mvp-in-process -m "Phase 1 — MVP in-process complete

Full functionality per PDF requirements + beyond:
- Multi-simulation per owner (1:N) via opaque OwnershipToken
- REST API: POST/GET /simulations, POST :id/finish, POST :id/restart
- WebSocket API /simulations namespace with subscribe/broadcast
- Engine + UniformRandomGoalDynamics + FakeClock-driven integration tests
- Domain layer with Zod-validated VOs + DDD aggregate + state machine
- All 12 ports + InMemory adapters
- 7 PDF requirements mapped to explicit tests (README)

Single-process (in-memory CommandBus + EventBus). Phase 2 will swap to
BullMQ + Redis and separate worker entrypoint without biznesowy code changes."
```

- [ ] **Step 5: Push branch + tag**

```bash
git push origin phase-1-mvp-in-process
git push origin v1.0-mvp-in-process
```

---

## Task 14: Post-implementation simplify review

**Files:**
- Potential: `docs/decisions/002-phase-1c-simplify.md` (only if findings)

- [ ] **Step 1: Invoke simplify skill**

Manual trigger (in implementation session):
```
Skill: simplify
Target: all Phase 1c changes (git diff main..HEAD since Phase 1b)
```

- [ ] **Step 2: Apply findings inline**

For each actionable finding, modify code and commit as `refactor: simplify review — <description>`.

- [ ] **Step 3: Document if multiple findings**

If ≥3 actionable items found, create ADR-002:

```markdown
# ADR-002: Phase 1c simplify review outcomes

- **Status**: Accepted
- **Date**: 2026-04-18
- **Phase**: 1c

## Context
After Phase 1c, ran simplify skill review.

## Findings
(list)

## Decision
(actions taken)

## Consequences
(impact)
```

- [ ] **Step 4: Re-run gates + commit**

```bash
npm run format:check && npm run lint && npx tsc --noEmit && npm test && npm run build
```

If findings applied, re-tag v1.0:
```bash
git tag -d v1.0-mvp-in-process
git tag -a v1.0-mvp-in-process -m "Phase 1 — MVP in-process (post-simplify review)"
```

---

## Task 15: Post-implementation security review

**Files:**
- Potential: `docs/decisions/003-phase-1c-security.md` (only if findings)

- [ ] **Step 1: Dispatch `feature-dev:code-reviewer` agent with security focus**

Scope:
- WebSocket input validation (Zod schemas on `subscribe`/`unsubscribe` payloads)
- HTTP input validation (Zod via `nestjs-zod`)
- Token leakage: does `console.log` leak tokens? Any verbose error messages expose them?
- CORS config on WebSocket (`cors: true` — is this too permissive for demo?)
- Header injection: is `x-simulation-token` header untrusted input correctly validated?
- `npm audit` for new WS deps
- Rate limiting on HTTP endpoints (`@nestjs/throttler` not used — acceptable for Phase 1 MVP?)

Prompt:
> Review Phase 1c implementation for security issues. Focus: WS input validation, HTTP input validation via nestjs-zod, token handling, CORS config, header trust boundaries, error verbosity, npm audit of @nestjs/websockets + socket.io. Separate Blocking / Important / Nit. Report concretely per file:line.

- [ ] **Step 2: `npm audit`**

```bash
npm audit --audit-level=moderate
```
Expected: no new HIGH/CRITICAL beyond known NestJS 10 moderate CVEs (carried from Phase 0). Document if any new findings.

- [ ] **Step 3: Apply findings + commit**

For each actionable: `fix(security): <short description>`.

- [ ] **Step 4: Create ADR-003 if ≥2 findings** (same template as ADR-002).

- [ ] **Step 5: Re-run gates + push**

```bash
npm run format:check && npm run lint && npx tsc --noEmit && npm test && npm run build
git push origin phase-1-mvp-in-process
git push origin v1.0-mvp-in-process --force-with-lease  # only if re-tagged
```

---

## Phase 1c — Task summary

| # | Task | Deliverable |
|---|---|---|
| 1 | WS deps + command types + topics | install + 3 files |
| 2 | SimulationOrchestrator (5 use cases) | ~15 unit tests |
| 3 | SimulationWorkerHandler | 4 unit tests |
| 4 | Zod DTOs + response shapes | 4 files |
| 5 | DomainExceptionFilter | 7 unit tests |
| 6 | SimulationController (5 REST endpoints) | 6 unit tests |
| 7 | WS gateway + event forwarder | 5 unit tests |
| 8 | Module wiring (Simulation + Ownership + AppModule + main.ts) | build + manual smoke |
| 9 | Integration: HTTP full lifecycle | 3 integration tests |
| 10 | Integration: manual finish + restart + throttle + validation | ~12 integration tests across 3 files |
| 11 | E2E WebSocket tests | 2 E2E tests |
| 12 | README req→test mapping | docs |
| 13 | CHANGELOG consolidated + git tag v1.0-mvp-in-process + push | release milestone |
| 14 | simplify review | inline fixes + optional ADR-002 |
| 15 | Security review + `npm audit` | inline fixes + optional ADR-003 |

**Expected test count after Phase 1c:** ~180 unit + ~15 integration + 2 E2E ≈ **200 tests**, <10s runtime.

**Tag `v1.0-mvp-in-process`** is the milestone — PDF requirements fulfilled, demo-ready.

**Next after Phase 1**: Phase 2 (BullMQ + Redis + out-of-process worker), planned in a separate spec-to-plan cycle.
