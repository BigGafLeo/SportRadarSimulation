# SportRadar Simulation

Zadanie rekrutacyjne SportRadar: REST + WebSocket API do symulacji meczów piłkarskich.

**Status**: Phase 4b JWT auth + ownership refactor (branch `phase-4-persistence-auth`). BullMQ + Redis transport, workers jako osobne procesy, 3 profile dynamics (`uniform-realtime`, `poisson-accelerated`, `fast-markov`), symulacje persystowane w PostgreSQL, JWT auth z user accounts. Pełna funkcjonalność z PDFa + beyond (multi-simulation, REST + WebSocket, 206+ testów).

- ✅ **Phase 4b — JWT auth + ownership refactor** (branch `phase-4-persistence-auth`)
  - JWT authentication via `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`
  - Password hashing with argon2 (`PasswordHasher` port — argon2 adapter + fake for tests)
  - `User` aggregate with `UserId`, `Email`, `HashedPassword` value objects; `UserRepository` port with Postgres + in-memory implementations
  - `RegisterUseCase` + `LoginUseCase`; `JwtAuthGuard` + `@CurrentUser()` decorator
  - Ownership refactor: `ownerToken: OwnershipToken` → `ownerId: string` (userId from JWT); `src/ownership/` module retired (ADR-010)
  - Three-step non-destructive migration (add nullable `owner_id` → backfill → NOT NULL + drop `owner_token`)
  - Demo user seeded via migration: `demo@sportradar.local` / `Demo1234!`
  - Mutating endpoints (start, finish, restart) require Bearer token; read-only (list, get, WS) remain unauthenticated
  - ADRs: 009 (auth architecture), 010 (ownership retirement)

- ✅ **Phase 4a — Postgres simulation persistence** (`v4.1-postgres-persistence`)
  - `PostgresSimulationRepository` via Prisma 5.x; hybrid schema (columns + JSONB `score_snapshot`)
  - Auto-migrate on container startup (`prisma migrate deploy`)
  - docker-compose adds postgres:16-alpine with healthcheck + named volume
  - `RedisSimulationRepository` removed (ADR-008); `PERSISTENCE_MODE=inmemory|postgres`
  - ADRs: 006 (full swap), 007 (schema hybrid), 008 (drop Redis repo)

## Auth endpoints

```
POST /auth/register  { email, password }     → 201 { accessToken, user }
POST /auth/login     { email, password }     → 200 { accessToken, user }
GET  /auth/me        [Bearer token required] → 200 { id, email, createdAt }
```

**Demo user:** `demo@sportradar.local` / `Demo1234!`

**Bearer token usage:** Send `Authorization: Bearer <token>` for mutating simulation endpoints (start, finish, restart). Read-only endpoints (list, get, WS) remain unauthenticated.

### Guard matrix

| Endpoint | Auth | Failure |
|---|---|---|
| `POST /simulations` | Bearer | 401 |
| `POST /simulations/:id/finish` | Bearer | 401 |
| `POST /simulations/:id/restart` | Bearer | 401 |
| `GET /simulations` | none | — |
| `GET /simulations/:id` | none | — |
| `WS subscribe/unsubscribe` | none | — |
| `POST /auth/register` | none | — |
| `POST /auth/login` | none | — |
| `GET /auth/me` | Bearer | 401 |

## Stack

- Node.js 20 LTS
- TypeScript 5.x strict
- NestJS 10.x
- Zod + nestjs-zod (walidacja)
- Jest (testy)

**Faza 2+**: BullMQ + Redis. **Faza 4+**: PostgreSQL + Prisma + JWT auth.

## Quick start

### Local dev

```bash
nvm use              # pick up Node 20 z .nvmrc
npm ci
npm run start:dev    # http://localhost:3000
```

### Docker (Phase 1 single-process — tag v1.0-mvp-in-process)

```bash
git checkout v1.0-mvp-in-process
docker compose up --build
```

### Distributed mode (Phase 2+ — default on main)

Full stack via docker-compose (orchestrator + N workers + Redis):

```bash
docker compose up --build
# http://localhost:3000 — orchestrator (REST + WS)
# http://localhost:3000/queues — Bull Board UI (live queue inspection)
```

Scale workers:
```bash
docker compose up -d --scale worker=4 --build
```

Single-process mode (Phase 1 style) via env:
```bash
TRANSPORT_MODE=inmemory PERSISTENCE_MODE=inmemory npm run start:dev
```

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
  -d '{"name": "Katar 2023 Match", "profile": "poisson-accelerated"}'
```

To scale workers per profile:
```bash
docker compose up -d --scale worker-poisson=5
```

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

External connection (host port 5434):
```bash
psql -h localhost -p 5434 -U sportradar -d sportradar
```

Wipe simulation state without restarting containers:
```bash
docker exec sportradar-postgres psql -U sportradar -d sportradar -c "TRUNCATE simulations;"
```

### Testy

```bash
npm test             # jednorazowo
npm run test:watch   # watch mode
npm run test:cov     # coverage
```

### Quality gates

```bash
npm run format:check
npm run lint
npm run typecheck
```

## Environment variables

Wszystkie env vars są zdefiniowane i walidowane przez Zod w `src/shared/config/config.schema.ts`. Defaulty wystarczają do lokalnego uruchomienia; wartości można nadpisać przez shell env lub plik `.env` (gitignored).

| Zmienna | Default | Opis |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `3000` | Port HTTP |
| `SIMULATION_DURATION_MS` | `9000` | Długość symulacji (ms) |
| `GOAL_INTERVAL_MS` | `1000` | Interval między golami (ms) |
| `GOAL_COUNT` | `9` | Liczba goli w pełnej symulacji |
| `FIRST_GOAL_OFFSET_MS` | `1000` | Offset pierwszego gola od startu |
| `START_COOLDOWN_MS` | `5000` | Throttle między ignition events per owner |
| `FINISHED_RETENTION_MS` | `3600000` | TTL dla FINISHED simulations (GC) |
| `GC_INTERVAL_MS` | `300000` | Częstotliwość GC worker'a |
| `PERSISTENCE_MODE` | `inmemory` | `inmemory` (dev/test) or `postgres` (prod). Was `redis` before Phase 4a — now removed. |
| `DATABASE_URL` | `postgresql://sportradar:sportradar@localhost:5432/sportradar` | Postgres connection string. Required when `PERSISTENCE_MODE=postgres`. In docker-compose, host:5434 → container:5432. |
| `JWT_SECRET` | (dev default in config) | HMAC secret for JWT signing (min 32 chars) |
| `JWT_EXPIRES_IN` | `900` | Access token TTL in seconds |
| `PASSWORD_MIN_LENGTH` | `8` | Minimum password length for registration |

## Requirements → Test mapping

Źródłowy spec wymagań: `TS-Coding-task.pdf` (gitignored lokalnie). Każde z 7 wymagań jest pokryte jawnym testem:

| Req # | Wymaganie | Test file(s) |
|---|---|---|
| 1 | Start / Finish / Restart | `test/integration/http-lifecycle.e2e-spec.ts`, `test/integration/http-manual-finish.e2e-spec.ts`, `test/integration/http-restart.e2e-spec.ts` |
| 2 | Name 8-30 znaków, Unicode letters/digits/spaces | `test/unit/domain/value-objects/simulation-name.spec.ts` + `test/integration/http-throttle-validation.e2e-spec.ts` |
| 3 | Start nie częściej niż raz na 5s | `test/unit/infrastructure/policies/five-second-cooldown.policy.spec.ts` + `test/integration/http-throttle-validation.e2e-spec.ts` |
| 4 | 9 sekund, auto-stop | `test/integration/simulation-engine-end-to-end.spec.ts` + `test/integration/http-lifecycle.e2e-spec.ts` |
| 5 | Manual finish przed 9s | `test/integration/http-manual-finish.e2e-spec.ts` |
| 6 | Gol co 1s, losowa drużyna, 9 total, push events | `test/unit/infrastructure/dynamics/uniform-random-goal-dynamics.spec.ts` + `test/e2e/ws-goal-observer.e2e-spec.ts` |
| 7 | Restart resetuje wyniki | `test/unit/domain/aggregates/simulation.spec.ts` + `test/integration/http-restart.e2e-spec.ts` |

Dodatkowo:
- Multi-observer WS broadcast: `test/e2e/ws-multi-observer.e2e-spec.ts`
- Ownership/authorization: `test/integration/http-manual-finish.e2e-spec.ts`
- Domain invariants (state machine): `test/unit/domain/aggregates/simulation.spec.ts`
- Engine + Dynamics end-to-end z FakeClock: `test/integration/simulation-engine-end-to-end.spec.ts`

**Stan testów**: 185 passed, 38 suites, <10s runtime.

## Architecture

Patrz pełny design spec: [`docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md`](./docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md).

Skrót:
- Hexagonal / Clean Architecture
- 10 portów w `domain/ports/`, adaptery w `infrastructure/`
- Engine (runtime) vs Dynamics (strategy) separation
- Simulation jako DDD Aggregate
- Message-driven (Faza 2+): BullMQ + Redis
- Profile-driven workers (Faza 3+)

## Phased Roadmap

| Faza | Tag | Zakres |
|---|---|---|
| 0 | `v0.1-scaffold` | Scaffolding, CI, Docker, folder structure |
| 1 | `v1.0-mvp-in-process` | Pełne wymagania PDFa, InMemory adapters, single profile |
| 2 | `v2.0-bullmq-distributed` | BullMQ + Redis, worker jako osobny entrypoint |
| 3 | `v3.0-profile-driven` ✅ | 3 profile w `PROFILES` registry: `uniform-realtime`, `poisson-accelerated`, `fast-markov`; `POST /simulations { profile? }`; docker-compose: worker-uniform ×2, worker-poisson ×1, worker-markov ×1; ADRs 002–005 |
| 4a | `v4.1-postgres-persistence` ✅ | `PostgresSimulationRepository` (Prisma 5.x, hybrid schema); auto-migrate on startup; `PERSISTENCE_MODE=inmemory\|postgres`; Redis repo removed; ADRs 006–008 |
| 4b | `v4.2-auth` ✅ | JWT auth, user accounts, ownership refactor (ownerToken → ownerId), `src/ownership/` retired, ADRs 009–010 |
| 5 | `v5.0-rich-operations` | Pause/resume, rich events, replay |
| 6 | `v6.0-ops-ready` | Health checks, structured logs, OpenAPI, metrics |

Plan implementacji per faza: [`docs/superpowers/plans/`](./docs/superpowers/plans/).

## Decision logging

Każda niebanalna decyzja architektoniczna = ADR w `docs/decisions/NNN-<slug>.md`. Patrz [CLAUDE.md](./CLAUDE.md) dla zasad (sekcja "Decision Logging").

## Project context

Patrz [CLAUDE.md](./CLAUDE.md) — architectural principles, testing philosophy, git workflow, interview prep talking points.

## License

Private (recruitment task).
