# Phase 4b: Auth + Ownership Refactor — Design Spec

## 1. Goal

Replace the opaque `OwnershipToken` system (Phase 1 stepping stone) with JWT-based authentication and user accounts. Simulations become owned by registered users instead of anonymous tokens. Auth is pluggable — swappable for an external IdP without touching simulation code.

## 2. Decisions Summary

| ID | Decision | Rationale |
|----|----------|-----------|
| D1 | Skip refresh tokens | Recruitment demo, not production. Access token only (15 min). Refresh = Phase 5+ if needed. |
| D2 | Delete `ownership/` module entirely | Stepping stone retired (like RedisSimulationRepository in Phase 2). New `auth/` bounded context replaces it. ADR documents lifecycle. |
| D3 | Two-step migration (non-destructive) | ADD `owner_id` nullable → backfill to demo user → SET NOT NULL + DROP `owner_token`. Demonstrates production-grade migration path. |
| D4 | Minimal auth scope: register + login + me | 3 endpoints + JwtAuthGuard. No logout (stateless JWT can't be revoked server-side). Email UNIQUE constraint. |
| D5 | Bare minimum User model | `id`, `email`, `passwordHash`, `createdAt`. No roles, no displayName. YAGNI — extensible when needed. |
| D6 | Loose coupling via shared contract (option B) | SimulationModule knows only `AuthenticatedUser { id, email }` interface + guard token. Swap to external IdP = new guard, zero simulation changes. |
| D7 | Throttle via SimulationRepository query | `findLastStartedAtByOwner(ownerId)` replaces `OwnershipRepository.lastIgnitionAt`. No extra table — data already in `simulations`. |

## 3. Auth Bounded Context — Architecture

```
src/auth/
  domain/
    aggregates/user.ts                    ← User aggregate (id, email, passwordHash, createdAt)
    value-objects/
      user-id.ts                          ← UUID VO (Zod validated, like SimulationId)
      email.ts                            ← Zod validated, lowercase, trimmed
      hashed-password.ts                  ← VO wrapping argon2 hash string
    ports/
      user-repository.port.ts             ← save, findByEmail, findById
      password-hasher.port.ts             ← hash(plain) → HashedPassword, verify(plain, hash) → boolean
  application/
    use-cases/
      register.use-case.ts                ← validate → check duplicate → hash → save → sign JWT
      login.use-case.ts                   ← findByEmail → verify hash → sign JWT
  infrastructure/
    persistence/
      postgres-user.repository.ts         ← Prisma-backed UserRepository
    security/
      argon2-password-hasher.ts           ← Argon2 adapter for PasswordHasher port
      jwt.strategy.ts                     ← Passport JWT strategy (Bearer header extraction)
      jwt-auth.guard.ts                   ← NestJS guard applying JWT strategy
      current-user.decorator.ts           ← @CurrentUser() param decorator
    consumer/
      http/auth.controller.ts             ← POST /auth/register, POST /auth/login, GET /auth/me
  auth.module.ts                          ← exports guard + decorator via token
```

### Ports

| Port | Contract | Fake (for tests) |
|------|----------|------------------|
| `UserRepository` | `save(user)`, `findByEmail(email)`, `findById(id)` | `InMemoryUserRepository` |
| `PasswordHasher` | `hash(plain): Promise<HashedPassword>`, `verify(plain, hash): Promise<boolean>` | `FakePasswordHasher` (plaintext compare, zero argon2 overhead) |

## 4. Shared Auth Contract (Pluggable Boundary)

SimulationModule sees ONLY this — never JWT, Passport, or User aggregate:

```typescript
// src/shared/auth/authenticated-user.ts
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
}

// src/shared/auth/auth.constants.ts
export const AUTH_GUARD = Symbol('AUTH_GUARD');
```

**Swap to external IdP**: replace `jwt.strategy.ts` + `jwt-auth.guard.ts` with JWKS-based guard. Controller, orchestrator, domain — zero changes. Cost: ~1-2h.

**Swap to microservice (B→C)**: extract `src/auth/` to separate NestJS app, add proxy routing. SimulationModule's guard validates token remotely instead of locally. Zero domain changes.

## 5. User Model + Prisma Schema

### New `User` table

```prisma
model User {
  id           String       @id @default(uuid()) @db.Uuid
  email        String       @unique @db.VarChar(255)
  passwordHash String       @map("password_hash") @db.VarChar(255)
  createdAt    DateTime     @default(now()) @map("created_at") @db.Timestamptz
  simulations  Simulation[]

  @@map("users")
}
```

### Updated `Simulation` table

```prisma
model Simulation {
  id            String    @id @db.Uuid
  name          String    @db.VarChar(30)
  profileId     String    @map("profile_id") @db.VarChar(50)
  state         String    @db.VarChar(20)
  totalGoals    Int       @map("total_goals")
  startedAt     DateTime  @map("started_at") @db.Timestamptz
  finishedAt    DateTime? @map("finished_at") @db.Timestamptz
  ownerId       String    @map("owner_id") @db.Uuid
  owner         User      @relation(fields: [ownerId], references: [id])
  scoreSnapshot Json      @map("score_snapshot")

  @@index([state])
  @@index([ownerId])
  @@map("simulations")
}
```

### Migration Strategy (Two-Step, Non-Destructive)

**Migration 1**: Create `users` table + add `owner_id` nullable column to `simulations`.

**Migration 2 (data migration)**: Insert demo user `demo@sportradar.local` with pre-computed argon2 hash of `Demo1234!` (hash embedded as literal in SQL — argon2 cannot run inside Postgres). Update all existing `simulations` rows: `SET owner_id = demo_user.id`.

**Migration 3**: Set `owner_id` NOT NULL, add FK constraint, drop `owner_token` column, drop `@@index([ownerToken])`.

Demo user credentials documented in README for local testing.

## 6. JWT Flow

### Endpoints

```
POST /auth/register { email: string, password: string }
  → validate input (Zod)
  → check email uniqueness → 409 EmailAlreadyExistsError if duplicate
  → argon2.hash(password)
  → save User
  → sign JWT { sub: user.id, email: user.email }
  → 201 { accessToken, user: { id, email, createdAt } }

POST /auth/login { email: string, password: string }
  → findByEmail → 401 if not found
  → argon2.verify(password, hash) → 401 if mismatch
  → sign JWT { sub: user.id, email: user.email }
  → 200 { accessToken, user: { id, email, createdAt } }

GET /auth/me
  → JwtAuthGuard (Bearer token)
  → decode JWT → extract user
  → findById(sub) → 401 if user deleted
  → 200 { id, email, createdAt }
```

### JWT Payload

```json
{
  "sub": "uuid-user-id",
  "email": "user@example.com",
  "iat": 1713600000,
  "exp": 1713600900
}
```

Access token TTL: 15 minutes. No refresh token (D1).

### Guard Matrix

| Endpoint | Guard | Auth failure |
|----------|-------|-------------|
| `POST /simulations` | `JwtAuthGuard` | 401 |
| `POST /simulations/:id/finish` | `JwtAuthGuard` | 401 |
| `POST /simulations/:id/restart` | `JwtAuthGuard` | 401 |
| `GET /simulations` | none | — |
| `GET /simulations/:id` | none | — |
| WS subscribe/unsubscribe | none | — |
| `POST /auth/register` | none | — |
| `POST /auth/login` | none | — |
| `GET /auth/me` | `JwtAuthGuard` | 401 |

## 7. Ownership Refactor

### Simulation Aggregate

```typescript
// Before (Phase 4a):
public readonly ownerToken: OwnershipToken

// After (Phase 4b):
public readonly ownerId: string
```

`SimulationSnapshot`: `ownerToken: string` → `ownerId: string`. `fromSnapshot()` and `toSnapshot()` updated accordingly.

### Orchestrator — Simplified

**Removed dependencies**: `ownershipRepository`, `tokenGenerator`.

**Removed methods**: `resolveOrIssueToken()`, `requireKnownToken()`.

**Simplified flow**:

```typescript
startSimulation(params: { userId: string, name: string, profileId?: string }) {
  const lastStartedAt = await this.simulationRepository.findLastStartedAtByOwner(userId);
  if (!this.throttlePolicy.canIgnite(userId, lastStartedAt, now)) {
    throw new ThrottledError(this.cooldownMs);
  }
  const sim = Simulation.start({ ...params, ownerId: userId });
  await this.simulationRepository.save(sim);
  // ... dispatch to worker
}

finishSimulation(simId: string, userId: string) {
  const sim = await this.findOrThrow(simId);
  this.assertOwnership(sim, userId);  // sim.ownerId === userId
  sim.finish();
}
```

### Controller — Header → Decorator

```typescript
// Before:
@Post() start(@Headers('x-simulation-token') token?: string)

// After:
@UseGuards(JwtAuthGuard)
@Post() start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartDto)
  → this.orchestrator.startSimulation({ userId: user.id, ... })
```

### SimulationRepository — Port Changes

**Updated method** (parameter type change):

```typescript
// Before: findByOwner(token: OwnershipToken): Promise<readonly Simulation[]>
// After:  findByOwner(ownerId: string): Promise<readonly Simulation[]>
```

**New method**:

```typescript
findLastStartedAtByOwner(ownerId: string): Promise<Date | null>
```

Postgres impl: `findFirst({ where: { ownerId }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } })`. Covered by `@@index([ownerId])`.

### ThrottlePolicy — Parameter Change

```typescript
// Before: canIgnite(token: OwnershipToken, lastIgnitionAt: Date | null, now: Date): boolean
// After:  canIgnite(userId: string, lastIgnitionAt: Date | null, now: Date): boolean
```

Logic unchanged. `userId` parameter retained (not used in current logic) for future per-user rate limiting (e.g., premium tiers with different cooldowns).

## 8. Deleted Code (Ownership Module Retirement)

Entire `src/ownership/` directory removed:

- `domain/value-objects/ownership-token.ts`
- `domain/ports/ownership-repository.port.ts`
- `domain/ports/ownership-token-generator.port.ts`
- `infrastructure/uuid-ownership-token.generator.ts`
- `infrastructure/in-memory-ownership.repository.ts`
- `ownership.module.ts`

Related tokens removed from `PORT_TOKENS`:
- `OWNERSHIP_REPOSITORY`
- `OWNERSHIP_TOKEN_GENERATOR`

Related errors removed from orchestrator:
- `UnknownTokenError` (no longer applicable — JWT guard handles auth)

`OwnershipMismatchError` stays — renamed or kept as-is (still 403 when userId ≠ sim.ownerId).

## 9. Config Schema Additions

```typescript
// Added to ConfigSchema in src/shared/config/config.schema.ts:
JWT_SECRET: z.string().min(32),                                    // no default — must be provided
JWT_EXPIRES_IN: z.coerce.number().int().positive().default(900),   // 15 minutes
PASSWORD_MIN_LENGTH: z.coerce.number().int().positive().default(8),
```

`JWT_SECRET` has no default — forces explicit configuration. docker-compose.yml provides a dev-only value.

## 10. Dependencies

### New packages

```
@nestjs/jwt ^10.x
@nestjs/passport ^10.x
passport ^0.7.x
passport-jwt ^4.x
argon2 ^0.31.x
```

### Dev dependencies

```
@types/passport-jwt ^4.x
```

## 11. Testing Strategy

### Unit Tests — Auth Domain/Application

**Happy paths:**
- `User` aggregate creation with valid data
- `RegisterUseCase` — register → returns JWT + user
- `LoginUseCase` — login with valid credentials → returns JWT

**Error/edge cases:**
- Register with duplicate email → `EmailAlreadyExistsError` (409)
- Register with invalid email format → validation error (400)
- Register with password shorter than `PASSWORD_MIN_LENGTH` → validation error (400)
- Login with non-existent email → `InvalidCredentialsError` (401)
- Login with correct email, wrong password → `InvalidCredentialsError` (401)

**Fakes**: `InMemoryUserRepository`, `FakePasswordHasher` (plaintext, zero argon2 overhead).

### Unit Tests — Ownership Refactor

- `SimulationOrchestrator` — start with userId (not token), ownership assertions
- `ThrottlePolicy` — canIgnite with userId param (logic unchanged)
- `Simulation` aggregate — snapshot roundtrip with `ownerId`
- Start two simulations faster than cooldown with same userId → `ThrottledError`
- Start simultaneously with two different userIds → both succeed (per-user throttle)

### Integration Tests (Testcontainers PG)

- `PostgresUserRepository` — save, findByEmail, findById, email UNIQUE constraint violation
- `PostgresSimulationRepository` — `findLastStartedAtByOwner` returns correct date / null

### E2E Tests (HTTP)

**Auth flow:**
- Register → login → me: full flow
- Register with duplicate email → 409
- Register with invalid email → 400
- Register with short password → 400
- Login with wrong email → 401
- Login with wrong password → 401
- `GET /auth/me` without token → 401
- `GET /auth/me` with expired/malformed JWT → 401

**Simulation + auth integration:**
- Start simulation with valid Bearer → 201, `ownerId` matches JWT sub
- Finish own simulation → 200
- Restart own simulation → 200
- Finish someone else's simulation → 403
- Start/finish/restart without Bearer → 401
- GET /simulations (no auth) → 200
- GET /simulations/:id (no auth) → 200

**Throttle with auth:**
- Same user starts two sims within cooldown → 429
- Same user starts after cooldown expires → 201
- Two different users start simultaneously → both 201

### Deleted Tests

All tests referencing `OwnershipToken`, `OwnershipRepository`, `UuidOwnershipTokenGenerator`, `resolveOrIssueToken()`, `requireKnownToken()`, `UnknownTokenError`, `x-simulation-token` header.

## 12. ADRs Required

- **ADR-009**: Auth architecture — JWT + Passport, loose coupling via shared contract, no refresh tokens
- **ADR-010**: Ownership module retirement — stepping stone lifecycle, replaced by auth bounded context

## 13. docker-compose.yml Updates

```yaml
environment:
  # ... existing vars ...
  JWT_SECRET: 'dev-secret-minimum-32-characters-long-for-hmac'
  JWT_EXPIRES_IN: 900
```

Added to all app services (orchestrator + workers). Workers need JWT_SECRET only if they ever validate tokens (currently they don't, but config schema requires it).

## 14. Interview Talking Points

1. **"Why delete ownership module instead of refactoring?"** → Stepping stone pattern. Phase 1 needed anonymous ownership fast. Phase 4b needs real auth. The code is completely different — refactoring would be more confusing than a clean swap. ADR documents the lifecycle.

2. **"Why loose coupling for auth?"** → SimulationModule doesn't know about JWT. Guard is injected via token. Swap to Keycloak/Auth0 = one new guard file, zero simulation changes. B→C (microservice) cost: ~1-2h.

3. **"Why no refresh tokens?"** → Conscious scope decision. Stateless JWT can't be revoked, so refresh without revocation adds complexity without security. DB-backed refresh is the right answer but out of scope for demo. Documented as Phase 5+.

4. **"How does throttle work without OwnershipRepository?"** → Query `simulations` table directly — `findLastStartedAtByOwner()`. Data already exists, covered by `@@index([ownerId])`. One fewer port to maintain.

5. **"userId param in ThrottlePolicy — why keep it if unused?"** → Future per-user rate limiting (premium tiers, different cooldowns). Zero cost now, avoids signature change later.

6. **"Two-step migration — why not just drop and recreate?"** → Demonstrates production-grade migration skills. In real system, dropping data is unacceptable. Backfill to demo user preserves existing simulations.
