# SportRadar Simulation

REST + WebSocket API do symulacji meczów piłkarskich.

> **Bare minimum (wymagania PDFa):** tag [`v1.0-mvp-in-process`](#phased-roadmap) — pełne 7 wymagań, 248 testów, single-process, InMemory adapters. Wszystko powyżej to demonstracja ewolucji architektury krok po kroku.

**Aktualny stan:** `main` = Phase 4b complete — JWT auth, user accounts, PostgreSQL persistence, BullMQ distributed workers, 3 profile dynamics. **460 testów, 69 suites, 0 failures.**

## Phased Roadmap

Każda faza zamknięta tagiem — `git checkout vN.M` = działająca wersja z danej fazy.

| Faza | Tag | Zakres | Testy |
|------|-----|--------|-------|
| 0 | [`v0.1-scaffold`](../../tree/v0.1-scaffold) | Scaffolding, CI, Docker, folder structure | 2 |
| **1** | [**`v1.0-mvp-in-process`**](../../tree/v1.0-mvp-in-process) | **Pełne wymagania PDFa**, InMemory adapters, single profile | **248** |
| 2 | [`v2.0-bullmq-distributed`](../../tree/v2.0-bullmq-distributed) | BullMQ + Redis, worker jako osobny entrypoint, Testcontainers | 272 |
| 3 | [`v3.0-profile-driven`](../../tree/v3.0-profile-driven) | 3 profile dynamics, AcceleratedClock, per-profile topic routing | 333 |
| 4a | [`v4.1-postgres-persistence`](../../tree/v4.1-postgres-persistence) | PostgreSQL + Prisma, auto-migrate, Redis repo retired | — |
| 4b | [`v4.2-auth-ownership`](../../tree/v4.2-auth-ownership) | JWT auth, user accounts, ownership refactor (ownerToken → ownerId) | 460 |
| *5* | *planned* | *Pause/resume, replay, match history, rich domain events* | — |
| *6* | *planned* | *Health checks, structured logs (Pino), OpenAPI, metrics, graceful shutdown* | — |

Szczegółowa dokumentacja testów per faza: [`docs/testing/`](./docs/testing/)
- [Phase 1](./docs/testing/phase-1-test-coverage.md) · [Phase 2](./docs/testing/phase-2-test-coverage.md) · [Phase 3](./docs/testing/phase-3-test-coverage.md) · [Phase 4](./docs/testing/phase-4-test-coverage.md)

## Architecture

**Hexagonal / Clean Architecture** — domain nie wie o NestJS, infrastructure nie wie o domain logic.

```
domain/        pure TS, 0 framework imports — aggregates, VOs, events, ports
application/   use cases, orchestrator — widzi tylko porty
infrastructure/ NestJS adapters, DB, HTTP, WS, BullMQ, clock, random
```

Kluczowe wzorce:
- **10 portów** (pluggability contract) — każdy z testowym fake'em (`FakeClock`, `SeededRandomProvider`, etc.)
- **Engine vs Dynamics** separation — runtime (timing loop) vs strategy (co, kiedy, kto). Swap dynamics = nowe reguły goli bez zmiany runtime
- **Simulation = DDD Aggregate** — state machine RUNNING ↔ FINISHED, invariants w aggregate, nie w serwisach
- **Profile-driven workers** (Phase 3+) — jeden obraz Docker, N replik z różnymi `SIMULATION_PROFILE` env var

Pełny design spec: [`docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md`](./docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md)

## Decision Log (ADRs)

Każda niebanalna decyzja architektoniczna = ADR w [`docs/decisions/`](./docs/decisions/):

| ADR | Decyzja | Faza |
|-----|---------|------|
| [001](./docs/decisions/001-match-dynamics-intent-pattern.md) | MatchDynamics returns intents, not final events | 1 |
| [002](./docs/decisions/002-simulation-config-split.md) | SimulationConfig split: core + per-dynamics | 3 |
| [003](./docs/decisions/003-profile-registry.md) | Profile registry as const map | 3 |
| [004](./docs/decisions/004-per-profile-topic-routing.md) | Per-profile BullMQ topic routing | 3 |
| [005](./docs/decisions/005-accelerated-clock-semantics.md) | AcceleratedClock: real timestamps + virtual scheduling | 3 |
| [006](./docs/decisions/006-postgres-simulation-repository.md) | Postgres full swap (no Redis hybrid) | 4a |
| [007](./docs/decisions/007-schema-hybrid-columns-jsonb.md) | Hybrid schema: columns + JSONB score | 4a |
| [008](./docs/decisions/008-drop-redis-simulation-repository.md) | Drop RedisSimulationRepository | 4a |
| [009](./docs/decisions/009-auth-architecture.md) | Auth architecture: JWT + Passport + argon2 | 4b |
| [010](./docs/decisions/010-ownership-module-retirement.md) | Ownership module retirement → userId | 4b |

## Stack

| Warstwa | Technologia | Faza |
|---------|-------------|------|
| Runtime | Node.js 20 LTS | 0+ |
| Language | TypeScript 5.x (strict) | 0+ |
| Framework | NestJS 10.x | 0+ |
| Validation | Zod + `nestjs-zod` | 0+ |
| Testing | Jest + `@nestjs/testing` + supertest + `socket.io-client` | 0+ |
| Message bus | BullMQ + Redis | 2+ |
| Database | PostgreSQL 16 + Prisma 5.x | 4+ |
| Auth | `@nestjs/jwt` + `passport-jwt` + argon2 | 4+ |
| Container | Docker (multi-stage, non-root) | 0+ |
| Orchestration | docker-compose | 2+ |
| CI | GitHub Actions (lint + test) | 0+ |

## Quick start

### Local dev

```bash
nvm use              # Node 20 z .nvmrc
npm ci
npm run start:dev    # http://localhost:3000
```

### Docker — single-process (Phase 1)

```bash
git checkout v1.0-mvp-in-process
docker compose up --build
```

### Docker — distributed (Phase 2+, default on main)

```bash
docker compose up --build
# http://localhost:3000 — orchestrator (REST + WS)
# http://localhost:3000/queues — Bull Board UI
```

Scale workers:
```bash
docker compose up -d --scale worker=4 --build
```

### Profiles (Phase 3+)

`POST /simulations` accepts optional `profile`:

| Profile | Dynamics | Clock | Behaviour |
|---------|----------|-------|-----------|
| `uniform-realtime` (default) | UniformRandomGoal | SystemClock | 9 goals over 9s, fixed interval |
| `poisson-accelerated` | Poisson (mean 2.7/team) | AcceleratedClock(600×) | 90-min match ≈ 9s, realistic variance |
| `fast-markov` | FastMarkov (state machine) | AcceleratedClock(1000×) | event-driven match progression |

```bash
curl -X POST http://localhost:3000/simulations \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"name": "Katar 2023 Match", "profile": "poisson-accelerated"}'
```

### Auth endpoints (Phase 4b)

```
POST /auth/register  { email, password }     → 201 { accessToken, user }
POST /auth/login     { email, password }     → 200 { accessToken, user }
GET  /auth/me        [Bearer required]       → 200 { id, email, createdAt }
```

Demo user: `demo@sportradar.local` / `Demo1234!`

Mutating endpoints (start, finish, restart) require `Authorization: Bearer <token>`. Read-only (list, get, WS) remain unauthenticated.

| Endpoint | Auth | Failure |
|----------|------|---------|
| `POST /simulations` | Bearer | 401 |
| `POST /simulations/:id/finish` | Bearer | 401 |
| `POST /simulations/:id/restart` | Bearer | 401 |
| `GET /simulations` | none | — |
| `GET /simulations/:id` | none | — |
| `WS subscribe/unsubscribe` | none | — |

### Postgres persistence (Phase 4a+)

```bash
docker compose up -d    # starts Postgres + Redis + workers
docker compose down      # keep volume — sims persist
docker compose down -v   # reset everything
```

### Tests

```bash
npm test             # all (unit + integration + e2e)
npm run test:watch   # watch mode
npm run test:cov     # coverage
```

### Quality gates

```bash
npm run format:check
npm run lint
npm run typecheck
```

## Requirements → Test mapping

Źródłowy spec: `TS-Coding-task.pdf` (gitignored). Każde z 7 wymagań pokryte testem:

| # | Wymaganie | Test file(s) |
|---|-----------|-------------|
| 1 | Start / Finish / Restart | `http-lifecycle.e2e-spec.ts`, `http-manual-finish.e2e-spec.ts`, `http-restart.e2e-spec.ts` |
| 2 | Name 8-30, Unicode letters/digits/spaces | `simulation-name.spec.ts`, `http-throttle-validation.e2e-spec.ts` |
| 3 | Start max raz na 5s | `five-second-cooldown.policy.spec.ts`, `http-throttle-validation.e2e-spec.ts` |
| 4 | 9 sekund, auto-stop | `simulation-engine-end-to-end.spec.ts`, `http-lifecycle.e2e-spec.ts` |
| 5 | Manual finish przed 9s | `http-manual-finish.e2e-spec.ts` |
| 6 | Gol co 1s, losowa drużyna, 9 total, push events | `uniform-random-goal-dynamics.spec.ts`, `ws-goal-observer.e2e-spec.ts` |
| 7 | Restart resetuje wyniki | `simulation.spec.ts`, `http-restart.e2e-spec.ts` |

Dodatkowe:
- Multi-observer WS broadcast: `ws-multi-observer.e2e-spec.ts`
- Ownership/authorization: `simulation-auth.e2e-spec.ts`, `auth-flow.e2e-spec.ts`
- Domain invariants: `simulation.spec.ts` (state machine, multi-cycle, event ordering)

## Environment variables

Zdefiniowane i walidowane przez Zod w [`src/shared/config/config.schema.ts`](./src/shared/config/config.schema.ts). Defaulty wystarczają do lokalnego uruchomienia (poza `JWT_SECRET`).

| Zmienna | Default | Opis |
|---------|---------|------|
| `PORT` | `3000` | Port HTTP |
| `SIMULATION_DURATION_MS` | `9000` | Długość symulacji (ms) |
| `GOAL_INTERVAL_MS` | `1000` | Interval między golami (ms) |
| `GOAL_COUNT` | `9` | Liczba goli w pełnej symulacji |
| `FIRST_GOAL_OFFSET_MS` | `1000` | Offset pierwszego gola |
| `START_COOLDOWN_MS` | `5000` | Throttle per owner |
| `FINISHED_RETENTION_MS` | `3600000` | TTL dla FINISHED simulations |
| `GC_INTERVAL_MS` | `300000` | Częstotliwość GC |
| `SIMULATION_PROFILE` | `uniform-realtime` | Profil dynamics (Phase 3+) |
| `PERSISTENCE_MODE` | `inmemory` | `inmemory` / `postgres` |
| `DATABASE_URL` | `postgresql://...localhost:5432/sportradar` | Postgres connection (Phase 4+) |
| `JWT_SECRET` | **brak** (wymagany) | HMAC secret, min 32 chars (Phase 4+) |
| `JWT_EXPIRES_IN` | `900` | Token TTL w sekundach |
| `TRANSPORT_MODE` | `inmemory` | `inmemory` / `bullmq` (Phase 2+) |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection (Phase 2+) |
| `APP_MODE` | `orchestrator` | `orchestrator` / `worker` (Phase 2+) |

## Project context

Patrz [CLAUDE.md](./CLAUDE.md) — architectural principles, testing philosophy, git workflow.

## License

Private.
