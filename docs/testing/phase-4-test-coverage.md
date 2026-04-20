# Phase 4 — Persistence & Auth: Test Coverage

**Tag:** `v4.2-auth-ownership`
**Phase-specific tests:** 121 tests across 20 files
**Cumulative total:** 439 tests (Phase 1: 245 + Phase 2: 13 + Phase 3: 60 + Phase 4: 121)

---

## Auth Domain (25 tests / 4 files)

### Value Objects (20 tests / 3 files)

| File | Tests | Scenarios |
|------|-------|-----------|
| `email.spec.ts` | 9 | Lowercase normalization, whitespace trim, invalid format, empty string, equals(), multiple @, missing domain, apostrophe, plus-addressing, >254 chars (Zod limitation noted) |
| `user-id.spec.ts` | 7 | Valid UUID, non-UUID/empty rejection, equals(), uppercase UUID accepted, nil UUID accepted, no-dashes rejected |
| `hashed-password.spec.ts` | 4 | Wraps hash, empty rejection, whitespace-only accepted (no hash-format validation), value property |

### User Aggregate (5 tests / 1 file)

| Scenario | Details |
|----------|---------|
| Creation | All fields populated |
| Snapshot | fromSnapshot reconstruction, toSnapshot roundtrip |
| Properties | Correct getters |
| Identity | Same ID = same entity |

---

## Auth Application (16 tests / 2 files)

### Login Use Case (8 tests)

**File:** `test/unit/auth/application/use-cases/login.use-case.spec.ts`

| Scenario | Details |
|----------|---------|
| Happy path | Returns user data on valid credentials |
| Wrong email | InvalidCredentialsError |
| Wrong password | InvalidCredentialsError |
| Email normalization | Lookup uses lowercase |
| Empty password | InvalidCredentialsError |
| Return shape | No password fields exposed |
| Timing safety | Calls hasher.verify even when user not found (DUMMY_HASH path) |

### Register Use Case (8 tests)

**File:** `test/unit/auth/application/use-cases/register.use-case.spec.ts`

| Scenario | Details |
|----------|---------|
| Happy path | Registers, returns user data |
| Persistence | Saves to repository |
| Hashing | Password hashed before save |
| Duplicate email | EmailAlreadyExistsError |
| Normalization | Email lowercased before save |
| Return shape | No password fields |

---

## Auth Infrastructure (37 tests / 7 files)

### Security (12 tests / 2 files)

| File | Tests | Scenarios |
|------|-------|-----------|
| `argon2-password-hasher.spec.ts` | 7 | Produces argon2id, verify correct/wrong, random salt, empty password hash, empty against own hash, non-argon2 format throws TypeError |
| `jwt-strategy.spec.ts` | 5 | Returns AuthenticatedUser, sub->id mapping, email mapping, missing sub, missing email |

### HTTP Consumer (19 tests / 3 files)

| File | Tests | Scenarios |
|------|-------|-----------|
| `auth.controller.spec.ts` | 12 | Register 201 + accessToken + user, duplicate 409, login 200, wrong email/password 401, GET /me, user not found 401, ISO timestamps |
| `register-request.spec.ts` | 7 | Valid parse, missing email/password, invalid email, short password, boundary 8 chars, empty object |
| `login-request.spec.ts` | 7 | Valid parse, missing email/password, invalid email, empty password, boundary 1 char, empty object |

### Persistence (6 tests / 2 files)

| File | Tests | Scenarios |
|------|-------|-----------|
| `in-memory-user.repository.spec.ts` | 6 | Save + findByEmail, save + findById, null for unknown, overwrite on duplicate ID |
| `user-repository-factory.spec.ts` | 3 | inmemory routing, postgres routing, port methods |

---

## Simulation Persistence (3 tests / 1 file)

### Repository Factory (3 tests)

**File:** `test/unit/simulation/infrastructure/persistence/simulation-repository-factory.spec.ts`

| Scenario | Details |
|----------|---------|
| inmemory mode | Returns InMemorySimulationRepository |
| postgres mode | Returns PostgresSimulationRepository |
| Port compliance | Has save() and findById() |

---

## Shared Infrastructure (14 tests / 3 files)

### Config Schema (9 tests / 1 file)

**File:** `test/unit/shared/config/config.schema.spec.ts`

| Scenario | Details |
|----------|---------|
| SIMULATION_PROFILE | Default, known profiles accepted, unknown rejected |
| PERSISTENCE_MODE | inmemory + postgres accepted, redis rejected, case-sensitive |
| DATABASE_URL | Default, custom accepted, malformed rejected |
| JWT_SECRET | Missing or <32 chars rejected, exactly 32 accepted |
| JWT_EXPIRES_IN | 0 rejected, 1+ accepted |
| PORT | 0 rejected, 65535 accepted |
| START_COOLDOWN_MS | 0 accepted (nonnegative) |

### Prisma Client (3 tests / 1 file)

| Scenario | Details |
|----------|---------|
| Singleton | Same URL returns same instance |
| Interface | Has $disconnect method |
| Isolation | Different URLs return different instances |

### Redis Client (2 tests / 1 file)

| Scenario | Details |
|----------|---------|
| Creation | Creates ioredis instance |
| Lazy connect | No error on invalid host (deferred connection) |

---

## Integration Tests — PostgreSQL (16 tests / 2 files)

All integration tests use **Testcontainers** with real PostgreSQL.

### Postgres User Repository (5 tests)

| Scenario | Details |
|----------|---------|
| Save + findByEmail | Round-trip |
| Save + findById | Round-trip |
| Unknown email/ID | Returns null |
| Duplicate email | DB UNIQUE constraint rejects |

### Postgres Simulation Repository (11 tests)

| Scenario | Details |
|----------|---------|
| Insert | save() creates new row |
| Upsert | save() updates existing |
| findById | null for unknown, round-trip with JSONB score |
| findAll | Ordered by startedAt desc |
| findByOwner | Filters by ownerId |
| findLastStartedAtByOwner | null when empty, latest, scoped per owner |
| delete | Removes row, no-op for unknown |

---

## E2E Tests (19 tests / 2 files)

### Auth Flow (10 tests)

**File:** `test/e2e/auth-flow.e2e-spec.ts`

| Scenario | Status | Details |
|----------|--------|---------|
| POST /auth/register | 201 | accessToken + user returned |
| Duplicate email | 409 | ConflictException |
| Invalid email | 400 | Validation error |
| Short password | 400 | Validation error |
| POST /auth/login | 200 | accessToken on valid credentials |
| Wrong email | 401 | UnauthorizedException |
| Wrong password | 401 | UnauthorizedException |
| GET /auth/me | 200 | User data with valid Bearer |
| No token | 401 | Missing auth |
| Malformed token | 401 | Invalid auth |

### Simulation + Auth Integration (9 tests)

**File:** `test/e2e/simulation-auth.e2e-spec.ts`

| Scenario | Status | Details |
|----------|--------|---------|
| Start with Bearer | 201 | Simulation created |
| Start without Bearer | 401 | Requires auth |
| Finish own | 202 | Owner can finish |
| Finish other's | 403 | Ownership guard |
| Finish without Bearer | 401 | Requires auth |
| Restart without Bearer | 401 | Requires auth |
| Restart other's | 403 | Ownership guard |
| GET /simulations | 200 | Public read (no auth) |
| Two users start | Both 201 | Concurrent starts allowed |

---

## What's NOT Tested (and Why)

| Category | Files | Reason |
|----------|-------|--------|
| Port interfaces | password-hasher.port.ts, user-repository.port.ts, tokens.ts | TypeScript interfaces |
| Error classes | email-already-exists.error.ts, invalid-credentials.error.ts | Simple classes — tested via use cases that throw them |
| NestJS modules | auth.module.ts | DI wiring — tested through E2E |
| JwtAuthGuard | jwt-auth.guard.ts | Passport boilerplate — tested via E2E (401 responses) |
| CurrentUser decorator | current-user.decorator.ts | NestJS decorator — tested via controller specs and E2E |
| Fake test utilities | fake-password-hasher.ts | Test helper — verified by tests that use it |
| Postgres repository (unit) | postgres-user.repository.ts | Integration-tested with real DB; unit test with mocked Prisma adds no value |
| Email >254 chars | Zod accepts per RFC spec | Noted as Zod limitation; not a security concern for this project |
