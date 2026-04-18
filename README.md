# SportRadar Simulation

Zadanie rekrutacyjne SportRadar: REST + WebSocket API do symulacji meczów piłkarskich.

**Status**: Phase 0 (scaffolding) — struktura projektu gotowa, domain logic w Phase 1.

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

### Docker

```bash
docker compose up --build
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
| 3 | `v3.0-profile-driven` | Poisson / Markov dynamics, API profile param |
| 4 | `v4.0-persistence-auth` | PostgreSQL + Prisma, JWT auth |
| 5 | `v5.0-rich-operations` | Pause/resume, rich events, replay |
| 6 | `v6.0-ops-ready` | Health checks, structured logs, OpenAPI, metrics |

Plan implementacji per faza: [`docs/superpowers/plans/`](./docs/superpowers/plans/).

## Decision logging

Każda niebanalna decyzja architektoniczna = ADR w `docs/decisions/NNN-<slug>.md`. Patrz [CLAUDE.md](./CLAUDE.md) dla zasad (sekcja "Decision Logging").

## Project context

Patrz [CLAUDE.md](./CLAUDE.md) — architectural principles, testing philosophy, git workflow, interview prep talking points.

## License

Private (recruitment task).
