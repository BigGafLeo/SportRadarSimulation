# Changelog

Wszystkie znaczące zmiany w projekcie będą dokumentowane tutaj.

Format zgodny z [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Projekt używa [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [4.1.0] — 2026-04-19 — Phase 4a: Postgres simulation persistence

### Added
- `PostgresSimulationRepository` — Prisma-backed implementation of `SimulationRepository` port (full 5-method contract: save, findById, findAll, findByOwner, delete)
- Prisma schema (`prisma/schema.prisma`) with `Simulation` model: hybrid columns + JSONB `score_snapshot`, indexes on `state` and `owner_token`
- Initial migration `phase4a_simulation_table` (`prisma/migrations/`)
- `getPrismaClient(databaseUrl)` lazy singleton in `src/shared/infrastructure/prisma.client.ts`
- `DATABASE_URL` env var (config schema, default `postgresql://sportradar:sportradar@localhost:5432/sportradar`)
- `postgres:16-alpine` service in docker-compose with healthcheck + named volume (`postgres-data`); host port 5434 (5432/5433 often taken on dev machines)
- Auto-migration on container startup via `prisma migrate deploy` (Dockerfile CMD)
- `apk add openssl` in all Docker stages — required by Prisma query/migrate engines on Alpine
- Integration test: `PostgresSimulationRepository` CRUD via `@testcontainers/postgresql` (7 tests)
- Dependencies: `@prisma/client@^5.20`, `prisma@^5.20` (devDep), `@testcontainers/postgresql@^10.13` (devDep)
- `postinstall` script runs `prisma generate`; `db:migrate:dev`, `db:migrate:deploy`, `db:studio` helper scripts

### Changed
- **Breaking**: `PERSISTENCE_MODE` enum reduced from `inmemory|redis` to `inmemory|postgres` (Redis-as-persistence dropped per ADR-008)
- `SimulationModule` and `WorkerModule` factories now branch `inmemory|postgres`; both call `getPrismaClient()` for postgres path
- Module teardown (`onModuleDestroy`) adds `disconnectPrismaClient()` after existing shutdowns
- Dockerfile copies `prisma/` into builder + deps + runner; `prisma generate` runs via `postinstall`; `prisma migrate deploy` prepended to CMD
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
- **Hybrid repo NOT implemented**: Redis hot + Postgres cold was brainstormed but rejected — premature at our scale (10-180 writes/s vs PG's 5000+ TPS). Port stays open for Phase 6 if metrics demand it.
- **Durability verified**: `docker compose down && docker compose up -d` preserves all simulations (named volume `postgres-data`).

## [3.0.0] — 2026-04-19 — Phase 3: Profile-driven specialization

### Added
- 3 profile uruchomieniowe: `uniform-realtime` (default), `poisson-accelerated`, `fast-markov`
- `Profile` interface + const `PROFILES` registry w `src/simulation/infrastructure/profiles/`
- `PoissonGoalDynamics` — single Poisson process across all PRESET_TEAMS, exponential inter-arrival sampling
- `FastMarkovDynamics` — Markov chain over match states, internal walk to GOAL state with single emission
- `AcceleratedClock` — wraps any `Clock`, dzieli `sleep(ms)` przez factor; `now()` zwraca real time
- `RandomProvider.float(): number` (port extension; impl w Crypto + Seeded)
- `POST /simulations` przyjmuje opcjonalny `profile` (Zod whitelist)
- `SIMULATION_PROFILE` env var (config schema)
- docker-compose: `worker-uniform` (×2), `worker-poisson` (×1), `worker-markov` (×1)
- Integration test: per-profile topic routing (Testcontainers)
- E2E test: profile param defaults / acceptance / rejection

### Changed
- **Breaking**: `SimulationConfig` interface usunięty. Zastąpiony przez:
  - `CoreSimulationConfig { durationMs }` (advisory metadata, używana przez Poisson/Markov)
  - per-dynamics config interfaces (`UniformDynamicsConfig`, `PoissonDynamicsConfig`, `MarkovDynamicsConfig`) embedded w klasach
- `SimulationOrchestrator` deps: `config: SimulationConfig` → `cooldownMs: number`
- `WorkerModule`: hardcoded `DEFAULT_PROFILE_ID` → env-driven via `SIMULATION_PROFILE` + registry lookup

### ADRs
- ADR-002: SimulationConfig split into core + per-dynamics
- ADR-003: Profile registry as const map
- ADR-004: Per-profile topic routing `simulation.run.{profileId}`
- ADR-005: AcceleratedClock semantics (real timestamps, virtual scheduling)

### Notes
- Profile bez workera = lazy/pending (job czeka w queue). Phase 6 doda proper readiness gate (503).
- RichEventDynamics ODROCZONE do Phase 5 (rich domain events).

### Tagged
- `v3.0-profile-driven`

## [2.0.0] — 2026-04-18

### Phase 2 — BullMQ distributed workers
- `bullmq` + `ioredis` + `@nestjs/bullmq` + Bull Board UI + `testcontainers` installed
- Shared Redis client factory (`createRedisClient`): lazy connection, BullMQ-compatible
- `Simulation.fromSnapshot` + `ScoreBoard.fromSnapshot` static methods for aggregate reconstruction
- `RedisSimulationRepository`: HSET-backed persistence, JSON snapshot serialization
- `BullMQCommandBus`: per-topic Queue + Worker, shutdown cleanup, Bull Board visible
- `BullMQEventBus`: single `simulation.events` queue, filter-based subscribe
- Env-based adapter selection: `TRANSPORT_MODE=inmemory|bullmq`, `PERSISTENCE_MODE=inmemory|redis`, `APP_MODE=orchestrator|worker`
- `WorkerModule`: minimal NestJS module for worker process (engine + dynamics + handler + BullMQ + Redis repo only)
- `src/worker.main.ts` + `WorkerBootstrapModule`: standalone worker entrypoint
- `main.ts`: Bull Board UI mounted at `/queues` when `TRANSPORT_MODE=bullmq`
- `Dockerfile`: APP_MODE-aware CMD (same image, different entrypoint via env)
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
- Dynamic imports in DI factories use relative paths (webpack does not resolve tsconfig aliases at runtime)
- Aggregate reconstruction uses `PRESET_MATCHES` constant (Phase 3 profile-driven dynamics will pass profile-specific matches)

### Tagged
- `v2.0-bullmq-distributed`

## [1.0.0] — 2026-04-18

### Phase 1c — Application + Consumer Gateway
- Application layer:
  - `SimulationOrchestrator` — 5 use cases (start/finish/restart/list/get) with ownership + throttle + state guards
  - `SimulationWorkerHandler` — CommandBus subscriber, per-simulation AbortController, manual-finish on abort
  - Command types: `RunSimulationCommand`, `AbortSimulationCommand`, `SIMULATION_TOPICS`
  - Orchestrator errors: `SimulationNotFoundError`, `OwnershipMismatchError`, `ThrottledError`, `UnknownTokenError`
- HTTP Consumer Gateway:
  - Zod DTOs (`CreateSimulationRequest`, `SimulationResponse`, `StartedResponse`) via `nestjs-zod`
  - `SimulationController` — POST /simulations, GET list, GET :id, POST :id/finish, POST :id/restart
  - `DomainExceptionFilter` — `@Catch(DomainError)` maps to HTTP 400/401/403/404/409/429; HTTP exceptions pass through
  - `SIMULATION_TOKEN_HEADER` constant
- WebSocket Consumer Gateway (namespace `/simulations`):
  - `SimulationGateway` — `subscribe`/`unsubscribe` handlers, Zod-validated payload, joins `simulation:{id}` room
  - `WsEventForwarder` — subscribes EventBus, broadcasts to rooms (`simulation-started`, `goal-scored`, `simulation-finished`, `simulation-restarted`)
- Module wiring: `OwnershipModule` (repo only) + `SimulationModule` (all ports + app + gateway + APP_FILTER)
- `main.ts`: typed `ConfigService<AppConfig>`, `IoAdapter`, global `ZodValidationPipe`, `enableShutdownHooks`
- Integration tests (HTTP + FakeClock): full lifecycle, manual finish, restart, throttle + validation
- E2E WebSocket tests (`socket.io-client`): single observer + multi-observer broadcast
- README req→test mapping table (7 PDF requirements)

### Phase 1b — Infrastructure adapters
- Clock adapters: `SystemClock` (setTimeout + AbortSignal), `FakeClock` (deterministic `advance(ms)` for tests)
- Random adapters: `CryptoRandomProvider` (node:crypto), `SeededRandomProvider` (LCG, deterministic)
- Persistence: `InMemorySimulationRepository`, `InMemoryOwnershipRepository`
- Token generator: `UuidOwnershipTokenGenerator` (delegates to RandomProvider)
- Policies: `FiveSecondCooldownPolicy`, `TtlRetentionPolicy`
- Domain type `SimulationConfig` (timing config for Engine/Dynamics)
- `UniformRandomGoalDynamics`: uniform 1/6 selection from `PRESET_TEAMS`, 9 goals
- `TickingSimulationEngine`: streaming tick loop with intent-dispatch to aggregate + abort handling
- Messaging: `InMemoryCommandBus`, `InMemoryEventBus`, `InMemoryEventPublisher`
- ADR-001: `MatchDynamics.nextStep.event` is an intent, not the final emitted event (intent-pattern)
- Integration test: full 9-goal flow completes in ~13ms wall-clock via FakeClock

### Phase 1a — Domain layer
- Value Objects with Zod validation: `TeamId`, `MatchId`, `Team`, `Match`, `SimulationId`, `SimulationName` (Unicode letters/digits/spaces regex + no-trim rule), `ScoreBoard` (immutable operations), `OwnershipToken`
- `PRESET_MATCHES` constant: Germany vs Poland, Brazil vs Mexico, Argentina vs Uruguay (PDF requirement)
- `PRESET_TEAMS` derived list of 6 teams for random selection
- Domain events: `DomainEvent` base + `SimulationStarted`, `GoalScored`, `SimulationFinished` (reason: manual|auto), `SimulationRestarted`
- Domain errors: `DomainError` base + `InvalidValueError` + `InvalidStateError` with `SimulationState` type
- `Simulation` aggregate root with state machine RUNNING ↔ FINISHED, `applyGoal`/`finish`/`restart` invariants, `pendingEvents` buffer, `toSnapshot()`
- All 12 port interfaces filled with method signatures
- `.gitattributes` with LF enforcement

### Testing summary
- **185 tests passing** across 38 suites, <10s runtime
- Req-to-test mapping: see README.md

### Tagged
- `v1.0-mvp-in-process`

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
- ADR-001: `MatchDynamics.nextStep.event` is an intent, not the final emitted event (intent-pattern)
- Integration test: full 9-goal flow completes in ~13ms wall-clock via FakeClock
- 65 new unit tests + 1 integration test (total 133)

### Phase 1b status
- Branch: `phase-1-mvp-in-process` (continues)
- Still no tag — `v1.0-mvp-in-process` is created after Phase 1c (Application + Gateway + E2E)
- Next: Phase 1c — SimulationOrchestrator + REST/WS gateway + integration/E2E tests

### Added (Phase 1a — domain layer, 2026-04-18)
- Value Objects with Zod validation: `TeamId`, `MatchId`, `Team`, `Match`, `SimulationId`, `SimulationName` (Unicode letters/digits/spaces regex + no-trim rule), `ScoreBoard` (immutable operations), `OwnershipToken`
- `PRESET_MATCHES` constant: Germany vs Poland, Brazil vs Mexico, Argentina vs Uruguay (PDF requirement)
- `PRESET_TEAMS` derived list of 6 teams for random selection in Phase 1b
- Domain events: `DomainEvent` base interface + `SimulationStarted`, `GoalScored`, `SimulationFinished` (reason: manual|auto), `SimulationRestarted`
- Domain errors: `DomainError` base + `InvalidValueError` + `InvalidStateError` with `SimulationState` type
- `Simulation` aggregate root with state machine RUNNING ↔ FINISHED, private constructor + `create()` factory, `applyGoal`/`finish`/`restart` invariants, `pendingEvents` buffer via `pullEvents()`, `toSnapshot()` read model
- All 12 port interfaces filled with method signatures:
  - Simulation ports: `Clock` (now+sleep with AbortSignal), `RandomProvider` (int+uuid), `SimulationRepository` (save/findById/findAll/findByOwner/delete), `EventPublisher` (publish), `SimulationEngine` (streaming `run(sim, emit, signal)` per design spec §6.3), `MatchDynamics` (nextStep → TimedEvent), `RetentionPolicy` (shouldRemove), `ThrottlePolicy` (canIgnite)
  - Ownership ports: `OwnershipRepository` (save/findByToken/updateLastIgnitionAt) + `OwnershipRecord` type, `OwnershipTokenGenerator` (generate)
  - Messaging ports: `CommandBus` (dispatch/subscribe) + `Command`/`Subscription` types, `EventBus` (publish/subscribe) + `EventMeta`/`EventFilter` types
- 68 unit tests total, <3s runtime
- `.gitattributes` with LF enforcement to resolve CRLF drift on Windows

### Changed
- `.eslintrc.cjs`: removed `no-empty-interface` override for ports (interfaces are no longer empty)

### Phase 1a status
- Branch: `phase-1-mvp-in-process`
- No tag yet — `v1.0-mvp-in-process` is created after Phase 1c completes (infrastructure + application + gateway + integration/E2E tests)
- Next: Phase 1b — Infrastructure adapters (Engine, Dynamics, Clock, Random, Repos, Policies, Buses)

## [0.1.0] — 2026-04-18

### Added
- Project scaffolding: TypeScript 5.x strict, NestJS 10.x, Zod + nestjs-zod
- Hexagonal folder structure: `simulation/` + `ownership/` + `shared/` bounded contexts
- 12 empty port interfaces (stubs) — wypełnione w Phase 1
- Zod-validated env config (`src/shared/config/`)
- Jest setup + sanity test (path aliasing, ts-jest)
- ESLint + Prettier with strict TypeScript rules (incl. `no-floating-promises`)
- Multi-stage Dockerfile (non-root user)
- docker-compose skeleton (app only; redis/postgres w późniejszych fazach)
- GitHub Actions CI (format check, lint, typecheck, test, build, docker build)
- README z phased roadmap + env vars table
- CLAUDE.md z architectural principles + decision logging rules
- Design spec `docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md`
- Phase 0 implementation plan `docs/superpowers/plans/2026-04-18-phase-0-scaffold.md`

### Notes
- `.env.example` skipped in root (path-guard hook); `config.schema.ts` jest canonical source of truth for env vars
- Code quality review (Task 3) dodał `@typescript-eslint/no-floating-promises` rule i usunął deprecated `interface-name-prefix`

### Tagged
- `v0.1-scaffold`

[Unreleased]: https://example.invalid/compare/v0.1-scaffold...HEAD
[0.1.0]: https://example.invalid/releases/tag/v0.1-scaffold
