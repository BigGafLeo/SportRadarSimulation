# Phase 4 — Persistence & Auth: Test Coverage

**Tag:** `v4.0-persistence-auth` (also `v4.1-postgres-persistence`, `v4.2-auth-ownership`)
**Total:** 460 tests across 69 suites (0 failures)
**New in Phase 4:** +127 tests / +15 suites vs Phase 3

---

## What's New in Phase 4

Phase 4 replaces the ownership-token model with **JWT authentication + user accounts**. Key changes:

- **Auth bounded context**: User aggregate, Email/UserId/HashedPassword VOs, register/login use cases, JWT strategy, Argon2 hashing
- **Ownership refactor**: `ownerToken: OwnershipToken` → `ownerId: string` (userId from JWT)
- **PostgreSQL persistence**: Prisma-backed repositories for simulations and users (Testcontainers)
- **Config hardening**: JWT_SECRET, DATABASE_URL, PERSISTENCE_MODE validation in Zod schema

### New Test Files (107 tests / 15 files)

**Auth Domain (27 tests / 4 files):**

| File | Tests | Scenarios |
|------|-------|-----------|
| `email.spec.ts` | 10 | Lowercase normalization, whitespace trim, invalid format, empty, equals(), multiple @, missing domain, apostrophe, plus-addressing, long email |
| `user-id.spec.ts` | 8 | Valid UUID, non-UUID/empty rejection, equals(), uppercase accepted, nil UUID, no-dashes rejected |
| `user.spec.ts` | 5 | Creation, fromSnapshot reconstruction, toSnapshot roundtrip, property getters, id-based identity |
| `hashed-password.spec.ts` | 4 | Wraps hash, empty rejection, whitespace-only accepted, value property |

**Auth Application (14 tests / 2 files):**

| File | Tests | Scenarios |
|------|-------|-----------|
| `register.use-case.spec.ts` | 7 | Happy path, saves to repo, hashes password, duplicate email error, email normalization, no password fields in return, lowercase verified via spy |
| `login.use-case.spec.ts` | 7 | Happy path, wrong email/password errors, email normalization, empty password error, no password fields, timing-safe DUMMY_HASH path |

**Auth Infrastructure (45 tests / 7 files):**

| File | Tests | Scenarios |
|------|-------|-----------|
| `auth.controller.spec.ts` | 11 | Register 201 + accessToken + user, ISO timestamps, accessToken string type, duplicate 409, login 200 + ISO + string, wrong email/password 401, GET /me, user-not-found 401 |
| `argon2-password-hasher.spec.ts` | 7 | argon2id output, verify correct/wrong, random salt, empty password, empty verify, malformed hash throws |
| `jwt-strategy.spec.ts` | 5 | AuthenticatedUser returned, sub→id, email mapping, missing sub/email |
| `register-request.spec.ts` | 7 | Valid, missing email/password, invalid email, short password (<8), boundary 8 chars, empty object |
| `login-request.spec.ts` | 7 | Valid, missing email/password, invalid email, empty password, boundary 1 char, empty object |
| `in-memory-user.repository.spec.ts` | 5 | Save+findByEmail, save+findById, null for unknown email/id, overwrite on duplicate id |
| `user-repository-factory.spec.ts` | 3 | inmemory routing, postgres routing, port methods present |

**Shared/Persistence (6 tests / 2 files):**

| File | Tests | Scenarios |
|------|-------|-----------|
| `prisma.client.spec.ts` | 3 | Singleton per URL, $disconnect method, different URLs → different instances |
| `simulation-repository-factory.spec.ts` | 3 | inmemory routing, postgres routing, port methods |

**E2E (21 tests / 2 files):**

| File | Tests | Scenarios |
|------|-------|-----------|
| `auth-flow.e2e-spec.ts` | 10 | Register 201+token, duplicate 409, invalid email 400, short password 400, login 200, wrong email/password 401, GET /me 200, no token 401, malformed token 401 |
| `simulation-auth.e2e-spec.ts` | 11 | Start with/without Bearer, finish own/other's/without Bearer, GET public reads (no auth), cooldown 429, restart without Bearer/other's, two users concurrent 201 |

**Distributed (5 tests / 1 file):**

| File | Tests | Scenarios |
|------|-------|-----------|
| `postgres-user.repository.spec.ts` | 5 | Save+findByEmail, save+findById, null unknowns, duplicate email UNIQUE constraint — **real Postgres via Testcontainers** |

### Enhanced Existing Files (+20 tests)

| File | Change | Details |
|------|--------|---------|
| `config.schema.spec.ts` | 3 → 16 | +13: PERSISTENCE_MODE (postgres/redis/case), DATABASE_URL (default/custom/malformed), JWT_SECRET (missing/<32/boundary), JWT_EXPIRES_IN, PORT, START_COOLDOWN_MS |
| `simulation-orchestrator.spec.ts` | 16 → 18 | Rewritten for userId API: start (userId, default/custom profile, CommandBus, EventBus), finish (own/mismatch/not-found), restart (own/mismatch/running), list/get, throttle (same user/different users/after cooldown) |
| `in-memory-simulation.repository.spec.ts` | 9 → 12 | +3: findLastStartedAtByOwner (null/latest/scoped by owner) |
| `simulation.controller.spec.ts` | 6 → 5 | Rewritten for JWT: POST uses userId from JWT, removed token-header tests |
| `domain-exception.filter.spec.ts` | 8 → 7 | Removed UnknownTokenError→401 mapping (replaced by Passport JwtAuthGuard) |
| `postgres-simulation.repository.spec.ts` | 5 → 10 | Was Redis-backed (Phase 2-3), now Postgres: insert, upsert, findById null/round-trip, findAll ordered, findByOwner, findLastStartedAtByOwner (null/latest/scoped), delete |
| `five-second-cooldown.policy.spec.ts` | 7 → 7 | Same count, API changed from ownerToken to userId |
| `http-manual-finish.e2e-spec.ts` | 4 → 4 | Same count, changed: "unknown token→401" becomes "different user→403", "no token→401" becomes "no Bearer→401" |
| `http-distributed.e2e-spec.ts` | 1 → 1 | Same count, added JWT auth setup (register + Bearer token) |

---

## Full Inventory by Layer

### Domain (141 tests / 15 files)

| Area | Tests | Files |
|------|-------|-------|
| Simulation aggregate | 20 | 1 |
| Simulation value objects | 71 | 8 |
| Simulation errors | 23 | 1 |
| Simulation events | 7 | 1 |
| Auth — User aggregate | 5 | 1 |
| Auth — value objects | 22 | 3 |

Note: `ownership-token.spec.ts` removed (OwnershipToken module deleted in Phase 4).

### Application (36 tests / 4 files)

| Area | Tests | Files |
|------|-------|-------|
| SimulationOrchestrator | 18 | 1 |
| SimulationWorkerHandler | 4 | 1 |
| RegisterUseCase | 7 | 1 |
| LoginUseCase | 7 | 1 |

### Infrastructure (220 tests / 33 files)

| Area | Component | Tests |
|------|-----------|-------|
| Simulation dynamics | Uniform + Poisson + Markov + teamPicker | 31 |
| Simulation engine | TickingSimulationEngine | 5 |
| Simulation persistence | InMemorySimulationRepository | 12 |
| Simulation policies | Cooldown + TTL | 13 |
| Simulation profiles | ProfileRegistry | 11 |
| Simulation HTTP | Controller (5) + Filter (7) + CreateSimRequest (3) | 15 |
| Simulation WS | Gateway + Forwarder | 6 |
| Auth security | Argon2Hasher (7) + JwtStrategy (5) | 12 |
| Auth HTTP | Controller (11) + RegisterRequest (7) + LoginRequest (7) | 25 |
| Auth persistence | InMemoryUserRepo (5) + UserRepoFactory (3) | 8 |
| Time | System (5) + Fake (7) + Accelerated (6) | 18 |
| Random | Crypto (7) + Seeded (8) | 15 |
| Messaging | CommandBus (7) + EventBus (8) + Publisher (2) | 17 |
| Shared infra | Redis client (2) + Prisma client (3) + SimRepoFactory (3) | 8 |
| Shared utils | shutdownIfPossible | 6 |
| Shared config | ConfigSchema | 16 |

### Integration — In-Process (14 tests / 5 files)

| File | Tests | Details |
|------|-------|---------|
| `simulation-engine-end-to-end.spec.ts` | 1 | Full 9-goal sim in <100ms via FakeClock |
| `http-lifecycle.e2e-spec.ts` | 3 | POST 201, full flow, GET list |
| `http-manual-finish.e2e-spec.ts` | 4 | Manual finish, no Bearer→401, different user→403, unknown sim→404 |
| `http-restart.e2e-spec.ts` | 2 | Restart after auto-finish, restart when RUNNING→409 |
| `http-throttle-validation.e2e-spec.ts` | 4 | Same user 5s→429, name validation (short/special/long) |

### Integration — Distributed (23 tests / 6 files)

All use **Testcontainers** with real Redis and/or PostgreSQL.

| File | Tests | Details |
|------|-------|---------|
| `bullmq-command-bus.spec.ts` | 3 | Dispatch, topic routing, unsubscribe |
| `bullmq-event-bus.spec.ts` | 2 | Event delivery, filter |
| `per-profile-routing.spec.ts` | 2 | Topic isolation, load balancing |
| `http-distributed.e2e-spec.ts` | 1 | Full BullMQ flow with JWT auth |
| `postgres-simulation.repository.spec.ts` | 10 | Full CRUD + findByOwner + findLastStartedAt — **real Postgres** |
| `postgres-user.repository.spec.ts` | 5 | Save/find + UNIQUE constraint — **real Postgres** |

### E2E (26 tests / 5 files)

| File | Tests | Details |
|------|-------|---------|
| `auth-flow.e2e-spec.ts` | 10 | Register/login/me full flow with error cases |
| `simulation-auth.e2e-spec.ts` | 11 | Simulation CRUD with ownership guards + concurrent users |
| `profile-param.e2e-spec.ts` | 3 | Profile parameter validation |
| `ws-goal-observer.e2e-spec.ts` | 1 | WebSocket 9-goal observation |
| `ws-multi-observer.e2e-spec.ts` | 1 | Multi-observer broadcast |

### Sanity (2 tests / 1 file)

Jest wiring + path alias import.

---

## Security Testing Highlights

| Concern | How Tested |
|---------|-----------|
| Password hashing | Argon2id output format, random salt (same password → different hashes), correct/wrong verify |
| Timing-safe login | LoginUseCase calls `hasher.verify()` even when user not found — DUMMY_HASH path prevents timing side-channel |
| JWT validation | Missing/malformed token → 401 (E2E), strategy extracts sub/email correctly |
| Ownership enforcement | Finish/restart other user's sim → 403 (E2E + unit), different user IDs isolated |
| Input validation | Email format, password min length, simulation name boundaries, config schema strictness |
| DB constraints | UNIQUE email at DB level (Postgres integration), FK owner_id constraint |

---

## Phase Evolution Summary

| Phase | Suites | Tests | Delta |
|-------|--------|-------|-------|
| 1 — MVP In-Process | 39 | 248 | — |
| 2 — BullMQ Distributed | 44 | 272 | +24 |
| 3 — Profile-Driven | 54 | 333 | +61 |
| 4 — Persistence & Auth | 69 | 460 | +127 |
