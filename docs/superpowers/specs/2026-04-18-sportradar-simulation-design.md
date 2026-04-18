# SportRadar Simulation — Design Specification

- **Status**: Draft (pending user review)
- **Date**: 2026-04-18
- **Owner**: Karol
- **Task source**: `TS-Coding-task.pdf` (SportRadar recruitment exercise)
- **Supersedes**: —

---

## 1. Context & Goals

### 1.1 Business task (from PDF)
REST + WebSocket API symulujące 3 mecze piłkarskie:
- Germany vs Poland
- Brazil vs Mexico
- Argentina vs Uruguay

API consumer może start/finish/restart symulacji. Symulacja trwa 9 sekund, co 1s losowa drużyna strzela gol, eventy są push'owane do consumenta.

### 1.2 Real goal (what's being measured)
Pokazanie podczas rozmowy rekrutacyjnej:
- Skalowalną, pluggable architekturę (hexagonal + DDD)
- Umiejętność planowania ewolucji (phased rollout z demonstracją podczas rozmowy)
- Clean code, testability, separation of concerns
- Znajomość nowoczesnego stacka TS/Node (NestJS, BullMQ, Zod, Prisma)

### 1.3 Non-goals
- Realistic football simulation (biznesowo irrelevant)
- UI / frontend (out of scope — backend only)
- Production-grade HA setup (demo purpose, choć gotowe fundamenty)

### 1.4 Kluczowe odwołania z treści PDFa
> *"Please set up scalable architecture and code structure (although this is a tiny app, let's assume it's going to grow a lot so you can turn a blind eye on the potential overengineering issue)"*

To jest **license** do overengineeringu — uzasadnia wszystkie architektoniczne decyzje powyżej prostego MVP.

---

## 2. Functional Requirements

### 2.1 Z PDFa (wymagania)

| # | Wymaganie | Implementacja |
|---|---|---|
| 1 | start / finish / restart | REST endpoints + aggregate state machine |
| 2 | Nazwa 8-30 znaków, Unicode letters/digits/spaces | Zod schema + VO `SimulationName` (patrz §5.2) |
| 3 | Start nie częściej niż raz na 5s | Domain throttle per-owner (patrz §5.5) |
| 4 | 9 sekund, auto-stop | Engine runtime + auto-finish event |
| 5 | Manual finish przed 9s | REST endpoint + AbortController → engine |
| 6 | Gol co 1s, losowa drużyna, 9 total | `MatchDynamics` (UniformRandomGoalDynamics) |
| 7 | Restart resetuje wyniki | Aggregate method `restart()` |

### 2.2 Beyond literal requirements (design stance)

- **Multi-simulation per owner (1:N)** — wymagane przez "grow a lot" (D1)
- **Multi-observer per simulation** — obserwatorzy bez tokena, jeden operator z tokenem (D2)
- **Profile-driven specialization (Phase 3)** — różne engines dla różnych use cases
- **Persistent storage (Phase 4)** — real DB, user accounts
- **Rich events (Phase 5)** — cards, injuries, pause/resume

### 2.3 Mandatory (z PDFa)
- TypeScript ✅
- Testy ✅

### 2.4 Bonus points (z PDFa)
- NestJS ✅
- WebSockets ✅

---

## 3. Architectural Principles

### 3.1 Hexagonal / Clean Architecture
- **Domain** — pure TS, 0 framework imports. Aggregates, VO, events, ports (interfaces).
- **Application** — use cases, orchestrator, koordynuje domain via porty.
- **Infrastructure** — NestJS adapters, DB, HTTP, WS, BullMQ, clock, random.
- **Dependency rule**: infrastructure → application → domain. **Nigdy odwrotnie.**

### 3.2 Pluggable everything (10 portów, patrz §6)
Każdy komponent, który może mieć >1 implementację, jest portem. Każdy ma testowy fake.

### 3.3 Separation: Engine vs Dynamics
- `SimulationEngine` = runtime (timing, abort, emit coordination). **Nie wie co to gol.**
- `MatchDynamics` = decyzyjny strategy ("co, kiedy, kto") wstrzyknięty do engine.
- Dwa ortogonalne wymiary variability — można wymieniać niezależnie.

### 3.4 DDD tactical
- `Simulation` = Aggregate Root ze stanem + invariants + state machine
- Value Objects immutable
- Domain Events emitowane przez aggregate

### 3.5 Message-driven (from Phase 2)
CommandBus (orchestrator → workers) + EventBus (workers → orchestrator). Phase 1 = InMemory. Phase 2+ = BullMQ + Redis.

### 3.6 Profile-driven specialization (from Phase 3)
Named kombinacje `{dynamics, clock, config}`. Worker wybiera profile z env. N replik per profile w docker-compose (nie N obrazów).

### 3.7 Zod everywhere
Jedno narzędzie walidacji: request DTOs, env config, domain VO, WS messages.

---

## 4. High-Level Architecture

### 4.1 Component diagram (Phase 2+ distributed; Phase 1 = wszystko w jednym procesie)

```
          ┌──────────────────────────────────────────────┐
          │  CONSUMER SIDE (edge)                        │
          │  HTTP controllers + WebSocket gateway        │
          │  + ownership token mgmt + observer subs      │
          │  + Zod parsing + token format/existence      │
          └────────────┬─────────────────────▲───────────┘
                       │ commands            │ events
                       ▼                     │
       ┌───────────────┴─────────────────────┴──────────┐
       │  ORCHESTRATOR (single instance, per-process)   │
       │  - Simulation aggregate (state, invariants)    │
       │  - Throttle / ownership policies (domain rules)│
       │  - Routes via CommandBus, listens via EventBus │
       └────────────┬─────────────────────▲─────────────┘
                    │ CommandBus          │ EventBus
                    │ (run/abort)         │ (goal/finished)
    ┌───────────────▼─────────────────────┴─────────────┐
    │  MESSAGE TRANSPORT (port)                         │
    │  InMemory (Phase 1)  →  BullMQ/Redis (Phase 2+)   │
    └────────────┬──────────┬─────────────┬─────────────┘
                 │          │             │
         ┌───────▼──┐  ┌────▼─────┐  ┌───▼──────┐
         │ Worker:  │  │ Worker:  │  │ Worker:  │
         │ uniform  │  │ poisson  │  │ markov-  │
         │ realtime │  │ realtime │  │ fast     │
         │          │  │          │  │          │
         │ Engine + │  │ Engine + │  │ Engine + │
         │ Dynamics │  │ Dynamics │  │ Dynamics │
         │ + Clock  │  │ + Clock  │  │ + Clock  │
         └──────────┘  └──────────┘  └──────────┘
```

### 4.2 Request flow — start simulation

1. `POST /simulations { name, profile? }` → Consumer Gateway
2. Gateway: Zod validation (shape), token extraction z headera (jeśli jest), token format check
3. Gateway → Orchestrator.startSimulation(cmd)
4. Orchestrator:
   - Jeśli brak tokena: generate nowy przez `OwnershipTokenGenerator`
   - Check `ThrottlePolicy.canIgnite(ownerId)` — jeśli `false` → 429 THROTTLED
   - Create `Simulation` aggregate (RUNNING, score 0:0:0, startedAt = now)
   - Save via `SimulationRepository`
   - Update `OwnershipRepository.lastIgnitionAt`
   - Response 201 `{ simulationId, ownershipToken, initialState }`
   - Dispatch `RunSimulationCommand { simulationId, profileId, teams, config }` do `CommandBus` topic `simulation.run.{profileId}`
5. Worker (matching profile) odbiera command:
   - `SimulationEngine.run(sim, emit, abortSignal)`
   - Engine loop: `MatchDynamics.nextStep(sim, tickIndex)` → `{ delayMs, event }`
   - `clock.sleep(delayMs)`, `emit(event)`
   - Po emit: `eventBus.publish(event, { simulationId })`
6. Orchestrator subskrybuje `EventBus`:
   - Otrzymuje `GoalScored`, aplikuje do aggregate, save, forward do ConsumerGateway
7. ConsumerGateway → WS room `simulation:{id}` → wszyscy observerzy

### 4.3 Request flow — manual finish

1. `POST /simulations/:id/finish` + `X-Simulation-Token: <uuid>`
2. Gateway: token format check, forward do Orchestrator
3. Orchestrator:
   - Lookup simulation, check ownership (token matches aggregate's ownerToken)
   - If not owner → 403 FORBIDDEN
   - If state !== RUNNING → 409 INVALID_STATE
   - Dispatch `AbortSimulationCommand { simulationId }` do `CommandBus` topic `simulation.abort`
4. Worker odbiera abort, `AbortController.abort()` → engine pending tick cancelled, emit `SimulationFinished { reason: 'manual' }`
5. Event flow jak w §4.2 steps 6-7

### 4.4 Race condition handling (t=9s scenarios)
Patrz D12. **Serializacja przez per-simulation command queue** w orchestratorze + explicit ordering policy.

---

## 5. Domain Model

### 5.1 Aggregate `Simulation`

```ts
class Simulation {
  private constructor(
    public readonly id: SimulationId,
    public readonly ownerToken: OwnershipToken,      // Phase 1-3; OwnerId w Phase 4+
    public readonly name: SimulationName,
    public readonly matches: readonly Match[],       // 3 mecze = 6 drużyn
    private state: SimulationState,                  // 'RUNNING' | 'FINISHED'
    private score: ScoreBoard,
    private readonly createdAt: Date,
    private startedAt: Date,
    private finishedAt: Date | null,
    private totalGoals: number,
    private readonly profileId: string,              // Phase 3+
  ) {}

  static create(params: CreateSimulationParams, now: Date): Simulation { /* ... */ }

  applyGoal(teamId: TeamId, now: Date): GoalScored {
    if (this.state !== 'RUNNING') throw new InvalidStateError();
    this.score.increment(teamId);
    this.totalGoals++;
    return new GoalScored(this.id, teamId, this.score.snapshot(), this.totalGoals);
  }

  finish(reason: 'manual' | 'auto', now: Date): SimulationFinished {
    if (this.state !== 'RUNNING') throw new InvalidStateError();
    this.state = 'FINISHED';
    this.finishedAt = now;
    return new SimulationFinished(this.id, reason, this.score.snapshot(), this.totalGoals);
  }

  restart(now: Date): SimulationRestarted {
    if (this.state !== 'FINISHED') throw new InvalidStateError();
    this.state = 'RUNNING';
    this.score.reset();
    this.totalGoals = 0;
    this.startedAt = now;
    this.finishedAt = null;
    return new SimulationRestarted(this.id);
  }

  toSnapshot(): SimulationSnapshot { /* ... */ }
}
```

### 5.2 Value Objects

| VO | Reguła |
|---|---|
| `SimulationId` | UUID v4 |
| `SimulationName` | 8-30 znaków, `^[\p{L}\p{N} ]+$`, no leading/trailing whitespace |
| `ScoreBoard` | Map<MatchId, {home, away}>, immutable snapshot |
| `TeamId`, `MatchId` | UUID lub enum-like string |
| `Team` | `{ id: TeamId, name: string }` |
| `Match` | `{ id: MatchId, home: Team, away: Team }` |
| `OwnershipToken` (Phase 1-3) | UUID v4 |
| `OwnerId` (Phase 4+) | userId from JWT |

Wszystkie z constructor `create(raw)` zwracającym `Result<VO, ZodError>` (Zod refinement).

### 5.3 Domain Events

Phase 1-3:
- `SimulationStarted` (with `isRestart` flag lub osobny `SimulationRestarted`)
- `GoalScored { simulationId, teamId, score, totalGoals, at }`
- `SimulationFinished { simulationId, reason, finalScore, totalGoals, at }`
- `SimulationRestarted { simulationId, at }`

Phase 5:
- `YellowCardIssued`, `RedCardIssued`
- `PlayerInjured`, `SubstitutionMade`
- `SimulationPaused`, `SimulationResumed`

### 5.4 State Machine

```
      ┌─────────────────────────┐
      │                         │
      │           restart()     │
      │      ┌──────────────┐   │
      │      │              │   │
      │      ▼              │   │
  ┌───┴──────────┐    ┌─────┴───────┐
  │   RUNNING    │───▶│   FINISHED   │
  └──────────────┘    └─────────────┘
      finish(auto|manual)
```

Invalid transitions throw `InvalidStateError` (→ HTTP 409).

### 5.5 Throttle rule (D3)

**Ignition event** = Start OR Restart. Obie mają ten sam throttle:

```
Przy ignition attempt dla ownerId:
  - lookup lastIgnitionAt z OwnershipRepository
  - if now - lastIgnitionAt < 5000ms: reject THROTTLED (429)
  - else: proceed + update lastIgnitionAt = now
```

Praktyczne implikacje:
- Normalnie symulacja trwa 9s > 5s cooldown, więc restart po naturalnym finish działa bez blokady
- Manual finish < 5s od startu + natychmiastowy restart = blocked (intencjonalne, anti-spam)
- User może mieć wiele równoczesnych symulacji, ale między ignition eventami (dla tego samego ownera) 5s przerwy

### 5.6 Goal timing (D11, D12)

- 9 goli łącznie w full 9s run
- Gole w t ∈ {1s, 2s, ..., 9s} od startu
- Na t=9s: `GoalScored → SimulationAutoFinished` (gol pierwszy, finish drugi)
- Manual finish = natychmiast, cancel wszystkich pending ticków
- Manual finish wygrywa race z pending goal tick (policy: abort przerywa wszystko natychmiastowo)

### 5.7 Random team selection (D13)

Uniform 1/6 across all 6 teams (wszystkie drużyny ze wszystkich 3 meczów w jednej puli). `RandomProvider.int(0, 5)`.

---

## 6. Ports & Adapters Catalog

### 6.1 10 portów + ich adaptery per fazie

| Port | Odpowiedzialność | Phase 1 impl | Phase 2+ | Phase 4+ | Testy |
|---|---|---|---|---|---|
| `SimulationRepository` | Persist aggregates | InMemorySimulationRepository | (same) | PostgresSimulationRepository | InMemory |
| `Clock` | Time abstraction (sleep, now) | SystemClock | (same) | (same) | FakeClock |
| `RandomProvider` | Randomness | CryptoRandomProvider | (same) | (same) | SeededRandomProvider |
| `EventPublisher` | Publish domain events do subskrybentów | InMemoryEventPublisher | (wraps BullMQEventBus) | (same) | NoopEventPublisher |
| `SimulationEngine` | Runtime (timing loop, abort) | TickingSimulationEngine | (same) | (same) | unit-tested directly |
| `MatchDynamics` | Decide what/when events | UniformRandomGoalDynamics | (same) | (same) | unit-tested directly |
| `RetentionPolicy` | GC FINISHED simulations | TtlRetentionPolicy(1h) | (same) | (same) | NoopRetentionPolicy |
| `ThrottlePolicy` | 5s cooldown rules | FiveSecondCooldownPolicy | (same) | (same) | AlwaysAllowPolicy |
| `OwnershipTokenGenerator` | Generate tokens | UuidTokenGenerator | (same) | (replaced by JWT flow) | FixedTokenGenerator |
| `CommandBus` | Dispatch commands | InMemoryCommandBus | BullMQCommandBus | (same) | InMemory |
| `EventBus` | Publish/subscribe events | InMemoryEventBus | BullMQEventBus | (same) | InMemory |

*(Technicznie 11 tokenów jeśli oddzielnie traktować `EventPublisher` i `EventBus`; w implementacji `EventPublisher` jest cienkim wrapper'em nad `EventBus`.)*

### 6.2 Injection tokens (NestJS)

```ts
// src/simulation/domain/ports/tokens.ts
export const PORT_TOKENS = {
  SIMULATION_REPOSITORY: Symbol('SimulationRepository'),
  CLOCK: Symbol('Clock'),
  RANDOM_PROVIDER: Symbol('RandomProvider'),
  EVENT_PUBLISHER: Symbol('EventPublisher'),
  SIMULATION_ENGINE: Symbol('SimulationEngine'),
  MATCH_DYNAMICS: Symbol('MatchDynamics'),
  RETENTION_POLICY: Symbol('RetentionPolicy'),
  THROTTLE_POLICY: Symbol('ThrottlePolicy'),
  OWNERSHIP_TOKEN_GENERATOR: Symbol('OwnershipTokenGenerator'),
  COMMAND_BUS: Symbol('CommandBus'),
  EVENT_BUS: Symbol('EventBus'),
} as const;
```

### 6.3 SimulationEngine + MatchDynamics contract (streaming-based, D14)

```ts
// domain/ports/simulation-engine.port.ts
export interface SimulationEngine {
  run(
    sim: Simulation,
    emit: (event: DomainEvent) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void>;
}

// domain/ports/match-dynamics.port.ts
export interface MatchDynamics {
  // Zwraca następny event + ile czekać. undefined = koniec (engine emit SimulationAutoFinished).
  nextStep(
    sim: Simulation,
    tickIndex: number,
  ): Promise<{ delayMs: number; event: DomainEvent } | undefined>;
}
```

**Rationale** (streaming-based zamiast iterator): user explicitly chose streaming. Engine zna Clock i AbortSignal. Dynamics jest czystsze (nie zna Clock, nie wie o abort — tylko "co dalej"). Struktura elastyczniejsza pod rich events i reactive behavior w Fazie 5.

### 6.4 CommandBus / EventBus contract

```ts
// shared/messaging/command-bus.port.ts
export interface CommandBus {
  dispatch<C extends Command>(topic: string, command: C): Promise<void>;
  subscribe<C extends Command>(topic: string, handler: (cmd: C) => Promise<void>): Subscription;
}

// shared/messaging/event-bus.port.ts
export interface EventBus {
  publish<E extends DomainEvent>(event: E, meta?: EventMeta): Promise<void>;
  subscribe(filter: EventFilter, handler: (event: DomainEvent, meta: EventMeta) => Promise<void>): Subscription;
}

export interface Subscription {
  unsubscribe(): Promise<void>;
}
```

---

## 7. Message Bus & Worker Model

### 7.1 Topics (CommandBus)

| Topic | Purpose | Payload |
|---|---|---|
| `simulation.run.{profileId}` | Orchestrator → matching worker | `{ simulationId, name, matches, config, profileId }` |
| `simulation.abort` | Orchestrator → all workers (filtered by simulationId) | `{ simulationId }` |
| `simulation.pause.{profileId}` (Phase 5) | Orchestrator → worker | `{ simulationId }` |
| `simulation.resume.{profileId}` (Phase 5) | Orchestrator → worker | `{ simulationId, checkpoint }` |

### 7.2 Topics (EventBus)

| Topic | Purpose | Payload |
|---|---|---|
| `simulation.events.{simulationId}` | Worker → orchestrator (+ observers) | DomainEvent |

Orchestrator subscribes with wildcard (`simulation.events.*`), filters by simulationId w handler.

### 7.3 Phase 1: InMemory impl

Node `EventEmitter`. Wszystko w jednym procesie. Zero infra.

### 7.4 Phase 2+: BullMQ impl

- Redis container w docker-compose
- `@nestjs/bullmq` integration
- Each `simulation.run.{profileId}` = osobna BullMQ queue
- Worker subscribes tylko do swojej queue (zgodnie z `SIMULATION_PROFILE` env)
- `simulation.abort` = broadcast via Redis pub/sub (nie queue — no persistence, fire-and-forget, worker filter local)
- EventBus = BullMQ queue `simulation.events` z consumer group style (orchestrator = consumer)
- **Retries**: exponential backoff, max 3, dead-letter queue
- **Bull Board** at `/queues` (admin-only from Phase 4; Phase 2-3 dev-only)

### 7.5 Worker entrypoint (Phase 2+)

`src/worker.main.ts` — bootstrap standalone NestJS app:
- `WorkerModule` z `SimulationEngine`, `MatchDynamics`, `Clock` (z profile)
- BullMQ consumer subscription do `simulation.run.{profileId}`
- Event publishing do EventBus
- **Brak**: Orchestrator, Controllers, WS Gateway, DB (worker jest stateless)

Dockerfile: ten sam obraz dla orchestratora i workera, entrypoint via env `APP_MODE=orchestrator|worker`.

### 7.6 Profile selection (Phase 3+)

**Worker wiring** (w `WorkerModule`):

```ts
const profileId = process.env.SIMULATION_PROFILE ?? 'uniform-realtime';
const profile = PROFILES.find(p => p.id === profileId) ?? throw new Error(...);

@Module({
  providers: [
    { provide: PORT_TOKENS.MATCH_DYNAMICS, useClass: profile.dynamics },
    { provide: PORT_TOKENS.CLOCK, useClass: profile.clock },
    { provide: SimulationConfig, useValue: profile.config },
    // ...
  ],
})
export class WorkerModule {}
```

**API routing**:
- `POST /simulations { profile?: string }` — default `"uniform-realtime"` jeśli brak
- Orchestrator dispatchuje do `simulation.run.{profile}`
- Jeśli żaden worker nie subskrybuje tego topicu → pending w queue (BullMQ), alert w metrics

**Walidacja profile**: Zod refinement na whitelist znanych profile IDs (reject unknown at gateway).

---

## 8. Ownership & Auth Evolution

### 8.1 Phase 1-3: Opaque ownership token

- `POST /simulations` bez header → create nowy token, zwrócić w response (201)
- Subsequent calls: header `X-Simulation-Token: <uuid>`
- Token = UUID v4 (`crypto.randomUUID()`)
- Stored in `OwnershipRepository` per token:
  - `{ token, createdAt, lastIgnitionAt, simulationIds: [] }`
- Throttle per token (patrz §5.5)
- Observer endpoints (WS subscribe, GET /simulations) NIE wymagają tokena

### 8.2 Phase 4: JWT auth + user accounts (D15)

**Refactor**: `OwnershipToken` (opaque) → `OwnerId` (userId z JWT sub claim).

**Endpoints**:
- `POST /auth/register { email, password }` — hash via argon2, insert user
- `POST /auth/login { email, password }` — verify hash, issue JWT access (15min) + refresh (7d)
- `POST /auth/refresh { refreshToken }` — new access token
- `GET /auth/me` — current user info

**Guards**:
- `JwtAuthGuard` na wszystkich `/simulations/*` mutacjach
- Observer endpoints (`GET /simulations`, WS subscribe) — nadal bez auth (public feed)

**Throttle**: per userId (zamiast per token)

**Ownership-of-simulation**: aggregate trzyma `ownerId: UserId` zamiast `ownerToken: OwnershipToken`. Auth guard wstrzykuje `CurrentUser` → orchestrator porównuje z aggregate.

**Migracja**: ten refactor jest izolowany do application + infra + testów. Porty `OwnershipRepository` → refactored na `UserRepository` + `SimulationOwnerPolicy`. Wszystkie zmiany trackowalne w osobnym ADR.

---

## 9. Phased Implementation Roadmap

Każda faza = **git tag** + **CHANGELOG entry** + **osobny implementation plan** (w `docs/superpowers/plans/YYYY-MM-DD-phase-N-<slug>-plan.md`) + demo-ready state.

**Sequencing**: nie planujemy wszystkich 6 faz naraz. Po ukończeniu fazy N (git tag + demo) tworzymy implementation plan dla fazy N+1. Każdy plan ma jako inputs: ten spec + CHANGELOG z poprzedniej fazy + ewentualne ADR'y które się pojawiły. To zachowuje elastyczność — jeśli po Fazie 2 pojawi się nowy insight, plan Fazy 3 go uwzględni.

### Phase 0 — Fundament
**Tag**: `v0.1-scaffold`

- Monorepo / single-repo decision (single-repo)
- TypeScript strict mode + ESLint + Prettier
- NestJS scaffold + Zod integration (`nestjs-zod`)
- Config module z Zod env schema
- Hexagonal folder structure (empty ports as interfaces)
- Jest setup + sanity test
- README z architecture overview + phased roadmap link
- Dockerfile (multi-stage, non-root)
- docker-compose.yml szkielet
- GitHub Actions (lint + test)
- **Demo**: "repository scaffolded, architectural intent visible"

### Phase 1 — MVP in-process
**Tag**: `v1.0-mvp-in-process`

- Domain: `Simulation` aggregate, wszystkie VO, events, ports
- Application: Orchestrator + use cases (start/finish/restart/list/get)
- Infrastructure impl:
  - `InMemoryCommandBus`, `InMemoryEventBus` (Node EventEmitter)
  - `TickingSimulationEngine`, `UniformRandomGoalDynamics`
  - `SystemClock`, `CryptoRandomProvider`
  - `InMemorySimulationRepository`, `InMemoryOwnershipRepository`
  - `TtlRetentionPolicy(1h)`, `FiveSecondCooldownPolicy`
  - `UuidOwnershipTokenGenerator`
- Consumer Gateway: REST controllers + WS gateway + observer rooms + Zod DTOs
- Testy: unit (domain, application z fake ports) + integration (HTTP+WS flow z FakeClock, <100ms per test) + E2E (supertest + socket.io-client)
- Single profile "default" hardcoded
- Docker: jeden obraz, jedna replika
- **Demo**: "pełne wymagania PDFa, czyste warstwy, ale w jednym procesie — porty gotowe na wyciągnięcie"

### Phase 2 — Distributed (BullMQ + Redis)
**Tag**: `v2.0-bullmq-distributed`

- Swap `InMemoryCommandBus` → `BullMQCommandBus`
- Swap `InMemoryEventBus` → `BullMQEventBus` (lub Redis pub/sub dla abort)
- Wyciągnięcie workera: `src/worker.main.ts` (standalone NestJS)
- Graceful shutdown: orchestrator drenaj + worker in-flight completion
- docker-compose: orchestrator + redis + worker (N replik)
- Bull Board endpoint `/queues` (dev-only)
- Testy: E2E z real Redis (Testcontainers), pozostałe testy niezmienione
- **Demo**: "ten sam test biznesowy przechodzi na single-process i distributed. Zero zmian w kodzie biznesowym"

### Phase 3 — Profile-driven specialization
**Tag**: `v3.0-profile-driven`

- Nowe `MatchDynamics`:
  - `PoissonGoalDynamics` (90-min mecz, mean 2.7 goli/drużynę)
  - `FastMarkovDynamics` (akcelerowany, 9s → 300ms)
  - `RichEventDynamics` (goals + yellow/red cards + injuries + corners) — przygotowanie pod Fazę 5
- Nowe `Clock`:
  - `AcceleratedClock(factor)` (deterministic ratio na realtime)
  - `FixedStepClock` (replay-friendly)
- Profile registry (`src/simulation/infrastructure/profiles/`):
  - `uniform-realtime.profile.ts`
  - `poisson-realistic.profile.ts`
  - `markov-accelerated.profile.ts`
- Worker wiring via env `SIMULATION_PROFILE`
- API: `POST /simulations { profile?: string }` + Zod whitelist
- docker-compose: per-profile worker replica counts
- Testy: nowe testy dla każdego dynamics, profile routing test
- **Demo**: "Dodałem Poisson engine — 30 linii kodu, żadnej zmiany w Orchestrator/Gateway. Scale per-profile przez compose"

### Phase 4 — Persistence + Auth
**Tag**: `v4.0-persistence-auth`

- PostgreSQL 16 w docker-compose
- Prisma schema:
  - `User { id, email, passwordHash, createdAt }`
  - `Simulation { id, ownerId, name, state, score, ..., events[] }`
  - `SimulationEvent { id, simulationId, type, payload, at }` (for replay)
- Port implementations:
  - `PostgresSimulationRepository`
  - `PostgresUserRepository`
- Auth module:
  - argon2 hashing
  - `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`
  - Endpoints: register / login / refresh / me
  - `JwtAuthGuard` na `/simulations/*` mutacjach
  - `@CurrentUser()` decorator
- Refactor ownership (D15): opaque token → userId
- Throttle refactored per userId
- Testcontainers dla real Postgres w CI
- Testy: auth integration (register→login→authenticated), DB tests
- **Demo**: "real user system, real persistence, symulacje przeżywają restart kontenera"

### Phase 5 — Rich domain operations
**Tag**: `v5.0-rich-operations`

**Scope do doprecyzowania przy start fazy** (§13). Wybrany zestaw (sugestia):

1. **Pause / Resume**: state w aggregate (`PAUSED`), checkpoint save, engine restart from checkpoint
2. **Rich events w API**: `YellowCardIssued`, `RedCardIssued`, `PlayerInjured` (używa `RichEventDynamics`)
3. **Replay from history**: `GET /simulations/:id/replay` — odtwarza z `SimulationEvent` tabeli
4. **User's history**: `GET /users/me/simulations` — lista własnych + paginated
5. **Subscription preferences** (optional): user wybiera które event types dostaje przez WS

Reszta (batch, admin injection, ML-dynamics) = extension points visible in code, nie implementowane.

- **Demo**: "pokazuję jak nowe operacje podpinają się bez refaktoru core"

### Phase 6 — Ops maturity
**Tag**: `v6.0-ops-ready`

- Health checks `/healthz` + `/readyz` via `@nestjs/terminus` (Redis + DB + worker heartbeat)
- Structured logging (Pino) + correlation id middleware (propagowany przez commands)
- OpenAPI / Swagger auto-generated z Zod schemas
- OpenTelemetry instrumentation setup (hooks, metric impl opcjonalny)
- Graceful shutdown (SIGTERM handler: drain queues, close WS, finalize transactions)
- (Optional) Prometheus metrics: active simulations, goals/sec, throttle hits, worker utilization
- README: architecture deep-dive, ADR sheet, runbook
- **Demo**: "application feels production-ready. Swagger UI, Bull Board, health checks dla k8s"

---

## 10. Testing Strategy

### 10.1 Levels

| Level | Scope | Speed | Fake ports |
|---|---|---|---|
| Unit (domain) | Aggregate transitions, VO validation, pure logic | <1ms | N/A (pure) |
| Unit (application) | Orchestrator z fake ports | <5ms | FakeClock, SeededRandom, NoopPublisher, InMemoryRepo |
| Integration | NestJS Test module, controller + service + InMemory repo + FakeClock | <100ms per test | FakeClock always |
| E2E | supertest (HTTP) + socket.io-client (WS), full flow | <500ms per test | FakeClock (Phase 1-3); real Postgres via Testcontainers (Phase 4+) |

### 10.2 Deterministic tests

- `FakeClock` — manual `advance(ms)`, sync control
- `SeededRandomProvider` — fixed seed produces fixed sequence
- `NoopEventPublisher` — collects events in-memory for assertions

Testy 9-sekundowej symulacji wykonują się w **<100ms**.

### 10.3 Req-to-test mapping

Każde wymaganie z PDFa ma explicit test (w README tabela):

| Req # | Test file | Test name |
|---|---|---|
| 1 | `test/integration/simulation-lifecycle.spec.ts` | `start → finish → restart works` |
| 2 | `test/unit/domain/simulation-name.spec.ts` | `rejects < 8 chars`, `rejects > 30`, `rejects special chars`, `accepts unicode` |
| 3 | `test/integration/throttle.spec.ts` | `reject second start within 5s`, `allows after 5s` |
| 4 | `test/integration/auto-finish.spec.ts` | `auto-finishes after 9s` |
| 5 | `test/integration/manual-finish.spec.ts` | `manual finish before 9s stops ticks` |
| 6 | `test/integration/goal-ticks.spec.ts` | `9 goals scored in 9s`, `random team selection` |
| 7 | `test/integration/restart.spec.ts` | `restart resets score and totalGoals` |

### 10.4 Coverage cel
- Domain + application: 85%+
- Infrastructure: 70%+
- Zero tolerance dla uncovered domain logic

---

## 11. Tech Stack (final)

| Warstwa | Technologia | Uzasadnienie |
|---|---|---|
| Runtime | Node.js 20 LTS | aktualna LTS, najlepsze wsparcie |
| Language | TypeScript 5.x strict | mandatory z PDF, strict dla type safety |
| Framework | NestJS 10.x | bonus points z PDFa, DI, modules |
| Validation | Zod + `nestjs-zod` | type-safe, szeroko używany, jedno narzędzie na wszystkich warstwach |
| Testing | Jest + `@nestjs/testing` + supertest + `socket.io-client` | standard dla NestJS |
| Message bus | BullMQ + Redis | najlepsza DX w Node/TS, out-of-box features (D5) |
| DB (Phase 4+) | PostgreSQL 16 + Prisma | Prisma = best TS DX, type-safe queries, migration tooling |
| Auth (Phase 4+) | `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt` + argon2 | standard NestJS, argon2 nowocześniejsze niż bcrypt |
| Container | Docker (multi-stage, non-root, distroless-optional) | standard dla recruitment demo |
| Orchestration | docker-compose | wystarcza dla demo, k8s = future |
| CI | GitHub Actions (lint + test + build) | free, szeroko używany |
| Testcontainers | @testcontainers/node | real Postgres/Redis w CI (Phase 4+) |
| Observability | Pino + OpenTelemetry hooks | Pino = najszybszy Node logger, OTel = future-proof |

---

## 12. Key Decisions Log

*(Krótkie podsumowania; pełne ADRs w `docs/decisions/` gdy będą powstawać w trakcie implementacji)*

| ID | Decision | Rationale |
|---|---|---|
| D1 | Multi-simulation (not single-global) od startu | "grow a lot" z treści zadania |
| D2 | Opcja C: opaque ownership token (Phase 1-3) | ownership bez heavy auth, evolution path do real auth |
| D3 | Restart ≡ Start (ignition event), ten sam throttle 5s | prostszy model, req #3 jest ogólne ("started") |
| D4 | TTL 1h dla FINISHED simulations, active GC worker | zapobiega wzrostowi pamięci, port `RetentionPolicy` do swap |
| D5 | BullMQ over NATS/RabbitMQ/Kafka | best DX w Node, out-of-box features, right-sized |
| D6 | Engine (runtime) vs Dynamics (strategy) separation | 2 ortogonalne wymiary variability, single responsibility |
| D7 | Simulation jako DDD Aggregate | invariants w domain, nie w serwisach |
| D8 | Zod everywhere (requests, env, VO, WS) | jedna abstrakcja walidacji |
| D9 | Profile-driven replicas (nie cartesian workers) | unika N × M × K explosion |
| D10 | Regex nazwy: `\p{L}\p{N}` Unicode letters + digits + space | future internationalization |
| D11 | No trim, reject leading/trailing whitespace | no silent mutation |
| D12 | Goal count = 9; ordering na t=9s: goal → auto-finish; manual finish > wszystko | wireframe 6 goli = mid-simulation snapshot, req rządzi; deterministyczna kolejność |
| D13 | Random team selection: uniform 1/6 across all 6 teams | literalnie "random team among all teams" |
| D14 | SimulationEngine streaming-based (nie async iterator) | user wyraził preferencję; elastyczniejszy pod reactive behavior |
| D15 | Phase 4 auth refactor: opaque token → userId | clean evolution story, shows refactor skill |
| D16 | 3-warstwowa odpowiedzialność: Gateway (edge) / Orchestrator (business) / Aggregate (invariants) | separation of concerns, dependency rule respected |
| D17 | 10 portów formalnie (wszystkie) | spójność architektury, user explicit request |
| D18 | Auth w NestJS Guards (opcja C), nie edge proxy | demo simplicity, production note w README |
| D19 | 6-fazowy rollout z git tags | demonstrable evolution na rozmowie |
| D20 | CommandBus/EventBus jako porty od Fazy 1 | Phase 2 migration = swap adapter, zero biz code change |

Wszystkie decyzje mają pełny kontekst w konwersacji brainstormingowej; znaczące zmiany vs powyższe powinny dostać osobny ADR.

---

## 13. Open Questions / Phase 5 Scope Decision

Do rozstrzygnięcia przy starcie Fazy 5:
- **Dokładny zestaw rich operations** — aktualna sugestia: pause/resume + rich events + replay + user history. Możliwy review przy start fazy.
- **Subscription preferences**: implement w Fazie 5 czy skip?
- **Event sourcing głębokości**: persist wszystkich eventów od Fazy 4 czy tylko snapshot?

Do Fazy 6:
- **Metrics depth**: tylko OTel hooks + docs, czy full Prometheus + basic Grafana dashboard?

Poza fazami:
- **Frontend demo** — out of scope, ale gdyby chcieć: minimalistyczny React z WS subscription (nie blokuje submit zadania)

---

## 14. Appendix: Interview Talking Points

### A. Architektoniczne uzasadnienie
- "Task mówi 'grow a lot' → potraktowałem to poważnie i zaprojektowałem pod scale od dnia 1"
- "Hexagonal + DDD daje mi testowalność i swap-ability, niezbędne przy phased rollout"
- "Porty od Fazy 1 = Faza 2 (distributed) to zmiana adaptera, nie rewrite"

### B. Biggest tradeoff (potencjalne pytanie)
- **Zarzut**: "to overengineering dla 3 meczów"
- **Odpowiedź**:
  - Task explicit uzasadnia ("grow a lot, turn blind eye on overengineering")
  - Phased roadmap pokazuje, że **każda abstrakcja ma konkretną alternatywną implementację** — nie ma martwych portów
  - Demo dowolnej fazy działa — nie pokazuję "wieży z kodu" tylko "serię coherent deliverables"

### C. "Co gdybyś miał 2× więcej czasu?"
- Event sourcing od dnia 1 (nie tylko DB persistence)
- Full Kafka setup + KRaft (dla real event streaming)
- k8s operator dla auto-scaling worker pools per profile
- Full observability stack (Prometheus + Grafana + Jaeger)
- Load testing scenario + chaos engineering samples

### D. Key design moments
Odwołanie do §12 Key Decisions Log — przygotować narrację dla top 5 decyzji:
1. D5 (BullMQ vs alternatives) — right-sizing story
2. D6 (Engine vs Dynamics) — single responsibility + dimensions of variability
3. D9 (profile-driven replicas) — unikam cartesian explosion
4. D14 (streaming over iterator) — reactive behavior preparation
5. D19 (6-fazowy rollout) — demonstrable evolution

### E. Live demo plan (podczas rozmowy)
1. `git log --oneline --graph` — pokazać ewolucję
2. `git checkout v1.0-mvp-in-process` — uruchomić MVP, pokazać testy (9s w <100ms)
3. `git checkout v2.0-bullmq-distributed` — ten sam test działa, ale teraz via BullMQ/Redis
4. `git checkout v3.0-profile-driven` — pokazać Poisson engine, `POST { profile: "poisson-realistic" }`
5. `git checkout v4.0-persistence-auth` — register → login → start simulation jako authenticated user
6. `git checkout v5.0-rich-operations` — pause / resume / replay
7. Pokazać Bull Board live (podczas wykonywania symulacji)
8. Pokazać Swagger UI (jeśli Faza 6)

---

*End of spec. Next step: user review → implementation planning (writing-plans skill).*
