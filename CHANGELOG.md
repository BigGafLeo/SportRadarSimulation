# Changelog

Wszystkie znaczące zmiany w projekcie będą dokumentowane tutaj.

Format zgodny z [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Projekt używa [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
