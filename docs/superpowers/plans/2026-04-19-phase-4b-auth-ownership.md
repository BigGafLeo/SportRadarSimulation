# Phase 4b: Auth + Ownership Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace opaque OwnershipToken with JWT authentication and user accounts; retire the ownership module entirely.

**Architecture:** New `auth/` bounded context with loose coupling via shared `AuthenticatedUser` interface + guard token. JWT + Passport for Bearer auth. Two-step Prisma migration preserves existing data. Ownership module fully deleted after migration.

**Tech Stack:** `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `argon2`, Prisma, Zod

**Spec:** `docs/superpowers/specs/2026-04-19-phase-4b-auth-ownership-design.md`

---

## File Map

### New files — auth bounded context

| Path | Responsibility |
|------|---------------|
| `src/shared/auth/authenticated-user.ts` | Shared interface — only thing SimulationModule sees |
| `src/shared/auth/auth.constants.ts` | `AUTH_GUARD` symbol for loose coupling |
| `src/auth/domain/value-objects/user-id.ts` | UUID value object (Zod) |
| `src/auth/domain/value-objects/email.ts` | Email value object (Zod, lowercase, trimmed) |
| `src/auth/domain/value-objects/hashed-password.ts` | Wrapper for argon2 hash string |
| `src/auth/domain/aggregates/user.ts` | User aggregate (id, email, passwordHash, createdAt) |
| `src/auth/domain/ports/user-repository.port.ts` | save, findByEmail, findById |
| `src/auth/domain/ports/password-hasher.port.ts` | hash + verify |
| `src/auth/domain/errors/email-already-exists.error.ts` | 409 conflict |
| `src/auth/domain/errors/invalid-credentials.error.ts` | 401 auth failure |
| `src/auth/application/use-cases/register.use-case.ts` | Register flow |
| `src/auth/application/use-cases/login.use-case.ts` | Login flow |
| `src/auth/infrastructure/persistence/in-memory-user.repository.ts` | Test fake |
| `src/auth/infrastructure/persistence/postgres-user.repository.ts` | Prisma adapter |
| `src/auth/infrastructure/security/argon2-password-hasher.ts` | Argon2 adapter |
| `src/auth/infrastructure/security/fake-password-hasher.ts` | Test fake (plaintext) |
| `src/auth/infrastructure/security/jwt.strategy.ts` | Passport JWT strategy |
| `src/auth/infrastructure/security/jwt-auth.guard.ts` | NestJS guard |
| `src/auth/infrastructure/security/current-user.decorator.ts` | `@CurrentUser()` param decorator |
| `src/auth/infrastructure/consumer/http/auth.controller.ts` | POST register/login, GET me |
| `src/auth/infrastructure/consumer/http/dto/register.request.ts` | Zod DTO |
| `src/auth/infrastructure/consumer/http/dto/login.request.ts` | Zod DTO |
| `src/auth/auth.module.ts` | Exports guard + decorator via token |

### New test files

| Path | Scope |
|------|-------|
| `test/unit/auth/domain/value-objects/user-id.spec.ts` | UserId VO |
| `test/unit/auth/domain/value-objects/email.spec.ts` | Email VO |
| `test/unit/auth/domain/value-objects/hashed-password.spec.ts` | HashedPassword VO |
| `test/unit/auth/domain/aggregates/user.spec.ts` | User aggregate |
| `test/unit/auth/infrastructure/persistence/in-memory-user.repository.spec.ts` | Fake repo |
| `test/unit/auth/application/use-cases/register.use-case.spec.ts` | Register |
| `test/unit/auth/application/use-cases/login.use-case.spec.ts` | Login |
| `test/unit/auth/infrastructure/security/argon2-password-hasher.spec.ts` | Argon2 |
| `test/unit/auth/infrastructure/consumer/http/auth.controller.spec.ts` | Controller |
| `test/integration/distributed/postgres-user.repository.spec.ts` | PG integration |
| `test/e2e/auth-flow.e2e-spec.ts` | Auth endpoints E2E |
| `test/e2e/simulation-auth.e2e-spec.ts` | Sim + auth E2E |

### Modified files

| Path | Change |
|------|--------|
| `tsconfig.json` | Add `@auth/*` path alias |
| `src/shared/config/config.schema.ts` | Add `JWT_SECRET`, `JWT_EXPIRES_IN`, `PASSWORD_MIN_LENGTH` |
| `src/simulation/domain/aggregates/simulation.ts` | `ownerToken` → `ownerId` |
| `src/simulation/domain/ports/simulation-repository.port.ts` | `findByOwner(string)`, add `findLastStartedAtByOwner` |
| `src/simulation/domain/ports/throttle-policy.port.ts` | param `OwnershipToken` → `string` |
| `src/simulation/domain/ports/tokens.ts` | Remove `OWNERSHIP_*` tokens |
| `src/simulation/application/orchestrator/simulation-orchestrator.ts` | Full refactor to userId |
| `src/simulation/application/orchestrator/orchestrator.errors.ts` | Remove `UnknownTokenError` |
| `src/simulation/infrastructure/persistence/in-memory-simulation.repository.ts` | Adapt to ownerId |
| `src/simulation/infrastructure/persistence/postgres-simulation.repository.ts` | Adapt to ownerId |
| `src/simulation/infrastructure/policies/five-second-cooldown.policy.ts` | param string |
| `src/simulation/infrastructure/consumer/http/simulation.controller.ts` | `@CurrentUser` + guard |
| `src/simulation/infrastructure/consumer/http/domain-exception.filter.ts` | Remove `UnknownTokenError` |
| `src/simulation/simulation.module.ts` | Remove OwnershipModule, add auth |
| `src/app.module.ts` | Import AuthModule |
| `docker-compose.yml` | Add `JWT_SECRET` env |
| `prisma/schema.prisma` | Add User model, update Simulation |

### Deleted files

| Path | Reason |
|------|--------|
| `src/ownership/` (entire directory) | Stepping stone retired |
| `src/simulation/infrastructure/consumer/http/simulation-token.header.ts` | No longer needed |
| `test/unit/domain/value-objects/ownership-token.spec.ts` | Ownership retired |
| `test/unit/infrastructure/persistence/in-memory-ownership.repository.spec.ts` | Ownership retired |
| `test/unit/infrastructure/persistence/uuid-ownership-token.generator.spec.ts` | Ownership retired |

---

### Task 1: ADR-009 Auth Architecture + ADR-010 Ownership Retirement

**Files:**
- Create: `docs/decisions/009-auth-architecture.md`
- Create: `docs/decisions/010-ownership-module-retirement.md`

- [ ] **Step 1: Write ADR-009**

```markdown
# ADR-009: Auth Architecture — JWT + Passport with Loose Coupling

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 4b

## Context
Phase 4b replaces anonymous OwnershipToken with real user accounts. Need auth that is testable, swappable for external IdP, and does not couple SimulationModule to auth internals.

## Options considered
1. **Tight coupling** — SimulationModule imports auth guards directly. Simple but hard to swap.
2. **Loose coupling via shared contract** — SimulationModule sees only `AuthenticatedUser` interface + guard token. Auth module provides the implementation.
3. **Auth as separate microservice** — Full extraction. Over-engineering for monolith demo.

## Decision
Option 2 — loose coupling. SimulationModule depends on `AuthenticatedUser { id, email }` interface and `AUTH_GUARD` symbol. JWT strategy, Passport, User aggregate — all hidden inside `src/auth/`.

No refresh tokens — stateless JWT with 15min TTL. Refresh adds complexity without security value when there's no server-side revocation. Documented as Phase 5+ if needed.

## Consequences
- ✅ Swap to Keycloak/Auth0 = new guard, zero simulation changes (~1-2h)
- ✅ B→C (microservice) extraction cost: new NestJS app + proxy routing
- ✅ Tests use FakePasswordHasher (plaintext, no argon2 overhead)
- ❌ No token revocation — acceptable for recruitment demo
- 🔄 SimulationController changes from `@Headers('x-simulation-token')` to `@UseGuards() @CurrentUser()`
```

Save to `docs/decisions/009-auth-architecture.md`.

- [ ] **Step 2: Write ADR-010**

```markdown
# ADR-010: Ownership Module Retirement

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 4b
- **Supersedes**: Ownership module (Phase 1)

## Context
Phase 1 introduced `src/ownership/` as a stepping stone for anonymous token-based ownership. Phase 4b introduces real auth with JWT + user accounts. The ownership module is now redundant.

## Options considered
1. **Refactor in-place** — Rename OwnershipToken to userId, keep module structure.
2. **Delete and replace** — Remove entire `src/ownership/`, build new `src/auth/` from scratch.

## Decision
Option 2. The code is fundamentally different — OwnershipToken is a random UUID generator with in-memory storage; auth is JWT + Passport + User aggregate + Prisma. Refactoring would be more confusing than a clean swap.

Stepping stone lifecycle: Phase 1 created it → Phase 4b retires it. Like RedisSimulationRepository in Phase 2→4a.

## Consequences
- ✅ Clean codebase — no dead code or legacy abstractions
- ✅ ADR documents the lifecycle for interview discussion
- ❌ Tests referencing OwnershipToken must be rewritten
- 🔄 ThrottlePolicy parameter changes from OwnershipToken to string (userId)
- 🔄 SimulationRepository.findByOwner changes from OwnershipToken to string
- 🔄 Simulation aggregate: ownerToken → ownerId (string)
```

Save to `docs/decisions/010-ownership-module-retirement.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/009-auth-architecture.md docs/decisions/010-ownership-module-retirement.md
git commit -m "docs: ADR-009 auth architecture + ADR-010 ownership retirement"
```

---

### Task 2: Install Dependencies + Config Schema + tsconfig + Shared Auth Contract

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json:23-27`
- Modify: `src/shared/config/config.schema.ts:3-27`
- Create: `src/shared/auth/authenticated-user.ts`
- Create: `src/shared/auth/auth.constants.ts`

- [ ] **Step 1: Install auth dependencies**

```bash
npm install @nestjs/jwt@^10 @nestjs/passport@^10 passport@^0.7 passport-jwt@^4 argon2@^0.31
npm install -D @types/passport-jwt@^4
```

- [ ] **Step 2: Add `@auth/*` path alias to tsconfig.json**

In `tsconfig.json`, change `paths` from:

```json
"paths": {
  "@simulation/*": ["src/simulation/*"],
  "@ownership/*": ["src/ownership/*"],
  "@shared/*": ["src/shared/*"]
}
```

to:

```json
"paths": {
  "@simulation/*": ["src/simulation/*"],
  "@ownership/*": ["src/ownership/*"],
  "@auth/*": ["src/auth/*"],
  "@shared/*": ["src/shared/*"]
}
```

Note: `@ownership/*` is kept for now — removed in Task 17 when ownership module is deleted.

- [ ] **Step 3: Add JWT + auth config to config schema**

In `src/shared/config/config.schema.ts`, add these fields to the `ConfigSchema` object:

```typescript
JWT_SECRET: z.string().min(32).default('dev-secret-minimum-32-characters-long-for-hmac'),
JWT_EXPIRES_IN: z.coerce.number().int().positive().default(900),
PASSWORD_MIN_LENGTH: z.coerce.number().int().positive().default(8),
```

Add after the `SIMULATION_PROFILE` field.

- [ ] **Step 4: Create shared auth contract**

Create `src/shared/auth/authenticated-user.ts`:

```typescript
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
}
```

Create `src/shared/auth/auth.constants.ts`:

```typescript
export const AUTH_GUARD = Symbol('AUTH_GUARD');
```

- [ ] **Step 5: Verify typecheck passes**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/shared/config/config.schema.ts src/shared/auth/
git commit -m "chore: install auth deps, add JWT config, shared auth contract"
```

---

### Task 3: Auth Value Objects (UserId, Email, HashedPassword) + Tests

**Files:**
- Create: `src/auth/domain/value-objects/user-id.ts`
- Create: `src/auth/domain/value-objects/email.ts`
- Create: `src/auth/domain/value-objects/hashed-password.ts`
- Create: `test/unit/auth/domain/value-objects/user-id.spec.ts`
- Create: `test/unit/auth/domain/value-objects/email.spec.ts`
- Create: `test/unit/auth/domain/value-objects/hashed-password.spec.ts`

- [ ] **Step 1: Write UserId tests**

Create `test/unit/auth/domain/value-objects/user-id.spec.ts`:

```typescript
import { UserId } from '@auth/domain/value-objects/user-id';

describe('UserId', () => {
  it('creates from valid UUID', () => {
    const id = UserId.create('550e8400-e29b-41d4-a716-446655440000');
    expect(id.value).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('throws on non-UUID string', () => {
    expect(() => UserId.create('not-a-uuid')).toThrow('must be UUID');
  });

  it('throws on empty string', () => {
    expect(() => UserId.create('')).toThrow('must be UUID');
  });

  it('equals another UserId with same value', () => {
    const a = UserId.create('550e8400-e29b-41d4-a716-446655440000');
    const b = UserId.create('550e8400-e29b-41d4-a716-446655440000');
    expect(a.equals(b)).toBe(true);
  });

  it('not equal to UserId with different value', () => {
    const a = UserId.create('550e8400-e29b-41d4-a716-446655440000');
    const b = UserId.create('660e8400-e29b-41d4-a716-446655440001');
    expect(a.equals(b)).toBe(false);
  });
});
```

- [ ] **Step 2: Write Email tests**

Create `test/unit/auth/domain/value-objects/email.spec.ts`:

```typescript
import { Email } from '@auth/domain/value-objects/email';

describe('Email', () => {
  it('creates from valid email and lowercases', () => {
    const email = Email.create('User@Example.COM');
    expect(email.value).toBe('user@example.com');
  });

  it('trims whitespace', () => {
    const email = Email.create('  user@example.com  ');
    expect(email.value).toBe('user@example.com');
  });

  it('throws on invalid email format', () => {
    expect(() => Email.create('not-an-email')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => Email.create('')).toThrow();
  });

  it('equals another Email with same normalized value', () => {
    const a = Email.create('User@Example.com');
    const b = Email.create('user@example.com');
    expect(a.equals(b)).toBe(true);
  });
});
```

- [ ] **Step 3: Write HashedPassword tests**

Create `test/unit/auth/domain/value-objects/hashed-password.spec.ts`:

```typescript
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

describe('HashedPassword', () => {
  it('wraps a hash string', () => {
    const hp = HashedPassword.fromHash('$argon2id$v=19$m=65536,t=3,p=4$abc$def');
    expect(hp.value).toBe('$argon2id$v=19$m=65536,t=3,p=4$abc$def');
  });

  it('throws on empty string', () => {
    expect(() => HashedPassword.fromHash('')).toThrow();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx jest test/unit/auth/domain/value-objects/ --no-coverage
```

Expected: FAIL — modules not found.

- [ ] **Step 5: Implement UserId**

Create `src/auth/domain/value-objects/user-id.ts`:

```typescript
import { z } from 'zod';

const UserIdSchema = z.string().uuid();

export class UserId {
  private constructor(public readonly value: string) {}

  static create(raw: string): UserId {
    const parsed = UserIdSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`UserId: must be UUID, got "${raw}"`);
    }
    return new UserId(parsed.data);
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
```

- [ ] **Step 6: Implement Email**

Create `src/auth/domain/value-objects/email.ts`:

```typescript
import { z } from 'zod';

const EmailSchema = z.string().trim().toLowerCase().email();

export class Email {
  private constructor(public readonly value: string) {}

  static create(raw: string): Email {
    const parsed = EmailSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Email: invalid format, got "${raw}"`);
    }
    return new Email(parsed.data);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
```

- [ ] **Step 7: Implement HashedPassword**

Create `src/auth/domain/value-objects/hashed-password.ts`:

```typescript
export class HashedPassword {
  private constructor(public readonly value: string) {}

  static fromHash(hash: string): HashedPassword {
    if (!hash) {
      throw new Error('HashedPassword: hash cannot be empty');
    }
    return new HashedPassword(hash);
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx jest test/unit/auth/domain/value-objects/ --no-coverage
```

Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/auth/domain/value-objects/ test/unit/auth/domain/value-objects/
git commit -m "feat(auth): add UserId, Email, HashedPassword value objects + tests"
```

---

### Task 4: User Aggregate + Auth Domain Errors + Tests

**Files:**
- Create: `src/auth/domain/aggregates/user.ts`
- Create: `src/auth/domain/errors/email-already-exists.error.ts`
- Create: `src/auth/domain/errors/invalid-credentials.error.ts`
- Create: `test/unit/auth/domain/aggregates/user.spec.ts`

- [ ] **Step 1: Write User aggregate tests**

Create `test/unit/auth/domain/aggregates/user.spec.ts`:

```typescript
import { User } from '@auth/domain/aggregates/user';
import { UserId } from '@auth/domain/value-objects/user-id';
import { Email } from '@auth/domain/value-objects/email';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

describe('User', () => {
  const id = UserId.create('550e8400-e29b-41d4-a716-446655440000');
  const email = Email.create('user@example.com');
  const hash = HashedPassword.fromHash('$argon2id$hash');
  const now = new Date('2026-04-19T12:00:00Z');

  it('creates a user with all fields', () => {
    const user = User.create({ id, email, passwordHash: hash, createdAt: now });
    expect(user.id.value).toBe(id.value);
    expect(user.email.value).toBe('user@example.com');
    expect(user.passwordHash.value).toBe('$argon2id$hash');
    expect(user.createdAt).toEqual(now);
  });

  it('reconstructs from snapshot', () => {
    const user = User.fromSnapshot({
      id: id.value,
      email: 'user@example.com',
      passwordHash: '$argon2id$hash',
      createdAt: now,
    });
    expect(user.id.value).toBe(id.value);
    expect(user.email.value).toBe('user@example.com');
  });

  it('toSnapshot roundtrips', () => {
    const user = User.create({ id, email, passwordHash: hash, createdAt: now });
    const snap = user.toSnapshot();
    const restored = User.fromSnapshot(snap);
    expect(restored.id.equals(user.id)).toBe(true);
    expect(restored.email.equals(user.email)).toBe(true);
    expect(restored.passwordHash.value).toBe(user.passwordHash.value);
    expect(restored.createdAt).toEqual(user.createdAt);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest test/unit/auth/domain/aggregates/ --no-coverage
```

- [ ] **Step 3: Implement User aggregate**

Create `src/auth/domain/aggregates/user.ts`:

```typescript
import { UserId } from '../value-objects/user-id';
import { Email } from '../value-objects/email';
import { HashedPassword } from '../value-objects/hashed-password';

export interface UserSnapshot {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly createdAt: Date;
}

export interface CreateUserInput {
  readonly id: UserId;
  readonly email: Email;
  readonly passwordHash: HashedPassword;
  readonly createdAt: Date;
}

export class User {
  private constructor(
    public readonly id: UserId,
    public readonly email: Email,
    public readonly passwordHash: HashedPassword,
    public readonly createdAt: Date,
  ) {}

  static create(input: CreateUserInput): User {
    return new User(input.id, input.email, input.passwordHash, input.createdAt);
  }

  static fromSnapshot(snapshot: UserSnapshot): User {
    return new User(
      UserId.create(snapshot.id),
      Email.create(snapshot.email),
      HashedPassword.fromHash(snapshot.passwordHash),
      new Date(snapshot.createdAt),
    );
  }

  toSnapshot(): UserSnapshot {
    return {
      id: this.id.value,
      email: this.email.value,
      passwordHash: this.passwordHash.value,
      createdAt: this.createdAt,
    };
  }
}
```

- [ ] **Step 4: Implement auth domain errors**

Create `src/auth/domain/errors/email-already-exists.error.ts`:

```typescript
export class EmailAlreadyExistsError extends Error {
  constructor(public readonly email: string) {
    super(`Email already registered: ${email}`);
    this.name = 'EmailAlreadyExistsError';
  }
}
```

Create `src/auth/domain/errors/invalid-credentials.error.ts`:

```typescript
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password');
    this.name = 'InvalidCredentialsError';
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest test/unit/auth/domain/ --no-coverage
```

- [ ] **Step 6: Commit**

```bash
git add src/auth/domain/aggregates/ src/auth/domain/errors/ test/unit/auth/domain/aggregates/
git commit -m "feat(auth): add User aggregate + auth domain errors"
```

---

### Task 5: Auth Ports + Fakes (UserRepository, PasswordHasher) + Tests

**Files:**
- Create: `src/auth/domain/ports/user-repository.port.ts`
- Create: `src/auth/domain/ports/password-hasher.port.ts`
- Create: `src/auth/infrastructure/persistence/in-memory-user.repository.ts`
- Create: `src/auth/infrastructure/security/fake-password-hasher.ts`
- Create: `test/unit/auth/infrastructure/persistence/in-memory-user.repository.spec.ts`

- [ ] **Step 1: Create UserRepository port**

Create `src/auth/domain/ports/user-repository.port.ts`:

```typescript
import type { User } from '../aggregates/user';
import type { Email } from '../value-objects/email';
import type { UserId } from '../value-objects/user-id';

export interface UserRepository {
  save(user: User): Promise<void>;
  findByEmail(email: Email): Promise<User | null>;
  findById(id: UserId): Promise<User | null>;
}
```

- [ ] **Step 2: Create PasswordHasher port**

Create `src/auth/domain/ports/password-hasher.port.ts`:

```typescript
import type { HashedPassword } from '../value-objects/hashed-password';

export interface PasswordHasher {
  hash(plain: string): Promise<HashedPassword>;
  verify(plain: string, hash: HashedPassword): Promise<boolean>;
}
```

- [ ] **Step 3: Write InMemoryUserRepository tests**

Create `test/unit/auth/infrastructure/persistence/in-memory-user.repository.spec.ts`:

```typescript
import { InMemoryUserRepository } from '@auth/infrastructure/persistence/in-memory-user.repository';
import { User } from '@auth/domain/aggregates/user';
import { UserId } from '@auth/domain/value-objects/user-id';
import { Email } from '@auth/domain/value-objects/email';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

function makeUser(overrides: { id?: string; email?: string } = {}): User {
  return User.create({
    id: UserId.create(overrides.id ?? '550e8400-e29b-41d4-a716-446655440000'),
    email: Email.create(overrides.email ?? 'user@example.com'),
    passwordHash: HashedPassword.fromHash('$argon2id$hash'),
    createdAt: new Date('2026-04-19T12:00:00Z'),
  });
}

describe('InMemoryUserRepository', () => {
  let repo: InMemoryUserRepository;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
  });

  it('saves and finds by email', async () => {
    const user = makeUser();
    await repo.save(user);
    const found = await repo.findByEmail(Email.create('user@example.com'));
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(user.id.value);
  });

  it('saves and finds by id', async () => {
    const user = makeUser();
    await repo.save(user);
    const found = await repo.findById(user.id);
    expect(found).not.toBeNull();
    expect(found!.email.value).toBe('user@example.com');
  });

  it('returns null for unknown email', async () => {
    const found = await repo.findByEmail(Email.create('unknown@example.com'));
    expect(found).toBeNull();
  });

  it('returns null for unknown id', async () => {
    const found = await repo.findById(UserId.create('660e8400-e29b-41d4-a716-446655440001'));
    expect(found).toBeNull();
  });

  it('overwrites user on duplicate id', async () => {
    const user1 = makeUser({ email: 'first@example.com' });
    await repo.save(user1);
    const user2 = makeUser({ email: 'second@example.com' });
    await repo.save(user2);
    const found = await repo.findById(user1.id);
    expect(found!.email.value).toBe('second@example.com');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
npx jest test/unit/auth/infrastructure/persistence/ --no-coverage
```

- [ ] **Step 5: Implement InMemoryUserRepository**

Create `src/auth/infrastructure/persistence/in-memory-user.repository.ts`:

```typescript
import type { UserRepository } from '@auth/domain/ports/user-repository.port';
import type { User } from '@auth/domain/aggregates/user';
import type { Email } from '@auth/domain/value-objects/email';
import type { UserId } from '@auth/domain/value-objects/user-id';

export class InMemoryUserRepository implements UserRepository {
  private readonly store = new Map<string, User>();

  async save(user: User): Promise<void> {
    this.store.set(user.id.value, user);
  }

  async findByEmail(email: Email): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.email.equals(email)) return user;
    }
    return null;
  }

  async findById(id: UserId): Promise<User | null> {
    return this.store.get(id.value) ?? null;
  }
}
```

- [ ] **Step 6: Implement FakePasswordHasher**

Create `src/auth/infrastructure/security/fake-password-hasher.ts`:

```typescript
import type { PasswordHasher } from '@auth/domain/ports/password-hasher.port';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

export class FakePasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<HashedPassword> {
    return HashedPassword.fromHash(`fake:${plain}`);
  }

  async verify(plain: string, hash: HashedPassword): Promise<boolean> {
    return hash.value === `fake:${plain}`;
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npx jest test/unit/auth/ --no-coverage
```

- [ ] **Step 8: Commit**

```bash
git add src/auth/domain/ports/ src/auth/infrastructure/persistence/in-memory-user.repository.ts src/auth/infrastructure/security/fake-password-hasher.ts test/unit/auth/infrastructure/
git commit -m "feat(auth): add UserRepository + PasswordHasher ports with test fakes"
```

---

### Task 6: RegisterUseCase + Tests

**Files:**
- Create: `src/auth/application/use-cases/register.use-case.ts`
- Create: `test/unit/auth/application/use-cases/register.use-case.spec.ts`

- [ ] **Step 1: Write RegisterUseCase tests**

Create `test/unit/auth/application/use-cases/register.use-case.spec.ts`:

```typescript
import { RegisterUseCase } from '@auth/application/use-cases/register.use-case';
import { InMemoryUserRepository } from '@auth/infrastructure/persistence/in-memory-user.repository';
import { FakePasswordHasher } from '@auth/infrastructure/security/fake-password-hasher';
import { EmailAlreadyExistsError } from '@auth/domain/errors/email-already-exists.error';
import { User } from '@auth/domain/aggregates/user';
import { UserId } from '@auth/domain/value-objects/user-id';
import { Email } from '@auth/domain/value-objects/email';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

describe('RegisterUseCase', () => {
  let repo: InMemoryUserRepository;
  let hasher: FakePasswordHasher;
  let useCase: RegisterUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    hasher = new FakePasswordHasher();
    useCase = new RegisterUseCase(repo, hasher);
  });

  it('registers a new user and returns user data', async () => {
    const result = await useCase.execute({
      email: 'new@example.com',
      password: 'StrongPass1!',
    });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.email).toBe('new@example.com');
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('saves user to repository', async () => {
    const result = await useCase.execute({
      email: 'new@example.com',
      password: 'StrongPass1!',
    });
    const found = await repo.findByEmail(Email.create('new@example.com'));
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(result.id);
  });

  it('hashes the password before saving', async () => {
    await useCase.execute({
      email: 'new@example.com',
      password: 'StrongPass1!',
    });
    const found = await repo.findByEmail(Email.create('new@example.com'));
    expect(found!.passwordHash.value).toBe('fake:StrongPass1!');
  });

  it('throws EmailAlreadyExistsError on duplicate email', async () => {
    await useCase.execute({ email: 'dup@example.com', password: 'StrongPass1!' });
    await expect(
      useCase.execute({ email: 'dup@example.com', password: 'AnotherPass1!' }),
    ).rejects.toThrow(EmailAlreadyExistsError);
  });

  it('normalizes email to lowercase', async () => {
    const result = await useCase.execute({
      email: 'User@Example.COM',
      password: 'StrongPass1!',
    });
    expect(result.email).toBe('user@example.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest test/unit/auth/application/use-cases/register --no-coverage
```

- [ ] **Step 3: Implement RegisterUseCase**

Create `src/auth/application/use-cases/register.use-case.ts`:

```typescript
import { randomUUID } from 'crypto';
import { User } from '@auth/domain/aggregates/user';
import { UserId } from '@auth/domain/value-objects/user-id';
import { Email } from '@auth/domain/value-objects/email';
import { EmailAlreadyExistsError } from '@auth/domain/errors/email-already-exists.error';
import type { UserRepository } from '@auth/domain/ports/user-repository.port';
import type { PasswordHasher } from '@auth/domain/ports/password-hasher.port';

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
}

export interface RegisterResult {
  readonly id: string;
  readonly email: string;
  readonly createdAt: Date;
}

export class RegisterUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: RegisterInput): Promise<RegisterResult> {
    const email = Email.create(input.email);
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new EmailAlreadyExistsError(email.value);
    }

    const id = UserId.create(randomUUID());
    const passwordHash = await this.passwordHasher.hash(input.password);
    const now = new Date();

    const user = User.create({ id, email, passwordHash, createdAt: now });
    await this.userRepository.save(user);

    return { id: user.id.value, email: user.email.value, createdAt: user.createdAt };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest test/unit/auth/application/use-cases/register --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add src/auth/application/use-cases/register.use-case.ts test/unit/auth/application/use-cases/register.use-case.spec.ts
git commit -m "feat(auth): add RegisterUseCase with email uniqueness check"
```

---

### Task 7: LoginUseCase + Tests

**Files:**
- Create: `src/auth/application/use-cases/login.use-case.ts`
- Create: `test/unit/auth/application/use-cases/login.use-case.spec.ts`

- [ ] **Step 1: Write LoginUseCase tests**

Create `test/unit/auth/application/use-cases/login.use-case.spec.ts`:

```typescript
import { LoginUseCase } from '@auth/application/use-cases/login.use-case';
import { InMemoryUserRepository } from '@auth/infrastructure/persistence/in-memory-user.repository';
import { FakePasswordHasher } from '@auth/infrastructure/security/fake-password-hasher';
import { InvalidCredentialsError } from '@auth/domain/errors/invalid-credentials.error';
import { User } from '@auth/domain/aggregates/user';
import { UserId } from '@auth/domain/value-objects/user-id';
import { Email } from '@auth/domain/value-objects/email';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

describe('LoginUseCase', () => {
  let repo: InMemoryUserRepository;
  let hasher: FakePasswordHasher;
  let useCase: LoginUseCase;

  const userId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    repo = new InMemoryUserRepository();
    hasher = new FakePasswordHasher();
    useCase = new LoginUseCase(repo, hasher);

    const user = User.create({
      id: UserId.create(userId),
      email: Email.create('user@example.com'),
      passwordHash: await hasher.hash('CorrectPass1!'),
      createdAt: new Date('2026-04-19T12:00:00Z'),
    });
    await repo.save(user);
  });

  it('returns user data on valid credentials', async () => {
    const result = await useCase.execute({
      email: 'user@example.com',
      password: 'CorrectPass1!',
    });
    expect(result.id).toBe(userId);
    expect(result.email).toBe('user@example.com');
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('throws InvalidCredentialsError for non-existent email', async () => {
    await expect(
      useCase.execute({ email: 'nobody@example.com', password: 'CorrectPass1!' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('throws InvalidCredentialsError for wrong password', async () => {
    await expect(
      useCase.execute({ email: 'user@example.com', password: 'WrongPass!' }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('normalizes email before lookup', async () => {
    const result = await useCase.execute({
      email: 'User@Example.COM',
      password: 'CorrectPass1!',
    });
    expect(result.id).toBe(userId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest test/unit/auth/application/use-cases/login --no-coverage
```

- [ ] **Step 3: Implement LoginUseCase**

Create `src/auth/application/use-cases/login.use-case.ts`:

```typescript
import { Email } from '@auth/domain/value-objects/email';
import { InvalidCredentialsError } from '@auth/domain/errors/invalid-credentials.error';
import type { UserRepository } from '@auth/domain/ports/user-repository.port';
import type { PasswordHasher } from '@auth/domain/ports/password-hasher.port';

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface LoginResult {
  readonly id: string;
  readonly email: string;
  readonly createdAt: Date;
}

export class LoginUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const email = Email.create(input.email);
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const valid = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!valid) {
      throw new InvalidCredentialsError();
    }

    return { id: user.id.value, email: user.email.value, createdAt: user.createdAt };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest test/unit/auth/application/use-cases/login --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add src/auth/application/use-cases/login.use-case.ts test/unit/auth/application/use-cases/login.use-case.spec.ts
git commit -m "feat(auth): add LoginUseCase with credential verification"
```

---

### Task 8: Argon2PasswordHasher + Tests

**Files:**
- Create: `src/auth/infrastructure/security/argon2-password-hasher.ts`
- Create: `test/unit/auth/infrastructure/security/argon2-password-hasher.spec.ts`

- [ ] **Step 1: Write Argon2PasswordHasher tests**

Create `test/unit/auth/infrastructure/security/argon2-password-hasher.spec.ts`:

```typescript
import { Argon2PasswordHasher } from '@auth/infrastructure/security/argon2-password-hasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('hash produces an argon2id string', async () => {
    const hashed = await hasher.hash('MyPassword123');
    expect(hashed.value).toMatch(/^\$argon2id\$/);
  });

  it('verify returns true for correct password', async () => {
    const hashed = await hasher.hash('MyPassword123');
    const result = await hasher.verify('MyPassword123', hashed);
    expect(result).toBe(true);
  });

  it('verify returns false for wrong password', async () => {
    const hashed = await hasher.hash('MyPassword123');
    const result = await hasher.verify('WrongPassword', hashed);
    expect(result).toBe(false);
  });

  it('same password produces different hashes (random salt)', async () => {
    const h1 = await hasher.hash('SamePassword');
    const h2 = await hasher.hash('SamePassword');
    expect(h1.value).not.toBe(h2.value);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest test/unit/auth/infrastructure/security/argon2 --no-coverage
```

- [ ] **Step 3: Implement Argon2PasswordHasher**

Create `src/auth/infrastructure/security/argon2-password-hasher.ts`:

```typescript
import argon2 from 'argon2';
import type { PasswordHasher } from '@auth/domain/ports/password-hasher.port';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<HashedPassword> {
    const hashed = await argon2.hash(plain);
    return HashedPassword.fromHash(hashed);
  }

  async verify(plain: string, hash: HashedPassword): Promise<boolean> {
    return argon2.verify(hash.value, plain);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest test/unit/auth/infrastructure/security/argon2 --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add src/auth/infrastructure/security/argon2-password-hasher.ts test/unit/auth/infrastructure/security/argon2-password-hasher.spec.ts
git commit -m "feat(auth): add Argon2PasswordHasher adapter"
```

---

### Task 9: Prisma Schema + Migrations (User Table + Nullable owner_id + Demo User)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `scripts/hash-demo-password.ts` (temporary helper)
- Prisma migrations auto-generated

- [ ] **Step 1: Update Prisma schema**

Replace contents of `prisma/schema.prisma` with:

```prisma
generator client {
  provider      = "prisma-client-js"
  binaryTargets = ["native", "linux-musl-openssl-3.0.x"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String       @id @default(uuid()) @db.Uuid
  email        String       @unique @db.VarChar(255)
  passwordHash String       @map("password_hash") @db.VarChar(255)
  createdAt    DateTime     @default(now()) @map("created_at") @db.Timestamptz
  simulations  Simulation[]

  @@map("users")
}

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

Note: `ownerToken` column removal happens via custom SQL migration, NOT Prisma auto-diff. We keep the Prisma schema as the target state, but migration is multi-step.

- [ ] **Step 2: Create migration 1 — add users table + nullable owner_id**

Do NOT run `prisma migrate dev` (it would auto-diff and try to drop `owner_token` immediately). Instead, create migration manually:

```bash
mkdir -p prisma/migrations/20260419120000_add_users_and_nullable_owner_id
```

Create `prisma/migrations/20260419120000_add_users_and_nullable_owner_id/migration.sql`:

```sql
-- CreateTable: users
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique email
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AlterTable: add nullable owner_id to simulations
ALTER TABLE "simulations" ADD COLUMN "owner_id" UUID;

-- CreateIndex: owner_id index
CREATE INDEX "simulations_owner_id_idx" ON "simulations"("owner_id");
```

- [ ] **Step 3: Generate argon2 hash for demo user**

Create `scripts/hash-demo-password.ts`:

```typescript
import argon2 from 'argon2';

async function main(): Promise<void> {
  const hash = await argon2.hash('Demo1234!');
  console.log(hash);
}
main();
```

Run it:

```bash
npx ts-node scripts/hash-demo-password.ts
```

Copy the output hash (starts with `$argon2id$...`).

- [ ] **Step 4: Create migration 2 — demo user + backfill**

```bash
mkdir -p prisma/migrations/20260419120100_backfill_demo_user
```

Create `prisma/migrations/20260419120100_backfill_demo_user/migration.sql`:

Replace `<ARGON2_HASH>` with the actual hash from Step 3.

```sql
-- Insert demo user for local testing
INSERT INTO "users" ("id", "email", "password_hash", "created_at")
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'demo@sportradar.local',
    '<ARGON2_HASH>',
    CURRENT_TIMESTAMP
) ON CONFLICT ("email") DO NOTHING;

-- Backfill: point all existing simulations to demo user
UPDATE "simulations"
SET "owner_id" = 'a0000000-0000-0000-0000-000000000001'
WHERE "owner_id" IS NULL;
```

- [ ] **Step 5: Generate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 6: Clean up helper script**

```bash
rm scripts/hash-demo-password.ts
```

Remove `scripts/` directory if empty.

- [ ] **Step 7: Commit**

```bash
git add prisma/ src/
git commit -m "feat(db): add users table + nullable owner_id + demo user backfill migration"
```

---

### Task 10: PostgresUserRepository + Integration Tests

**Files:**
- Create: `src/auth/infrastructure/persistence/postgres-user.repository.ts`
- Create: `test/integration/distributed/postgres-user.repository.spec.ts`

- [ ] **Step 1: Write integration tests**

Create `test/integration/distributed/postgres-user.repository.spec.ts`:

```typescript
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { PostgresUserRepository } from '@auth/infrastructure/persistence/postgres-user.repository';
import { User } from '@auth/domain/aggregates/user';
import { UserId } from '@auth/domain/value-objects/user-id';
import { Email } from '@auth/domain/value-objects/email';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';
import { execSync } from 'child_process';

jest.setTimeout(60_000);

describe('PostgresUserRepository (testcontainers)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repo: PostgresUserRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const url = container.getConnectionUri();
    execSync(`npx prisma migrate deploy`, { env: { ...process.env, DATABASE_URL: url } });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    repo = new PostgresUserRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  afterEach(async () => {
    await prisma.simulation.deleteMany();
    await prisma.user.deleteMany();
  });

  function makeUser(overrides: { id?: string; email?: string } = {}): User {
    return User.create({
      id: UserId.create(overrides.id ?? 'b0000000-0000-0000-0000-000000000001'),
      email: Email.create(overrides.email ?? 'test@example.com'),
      passwordHash: HashedPassword.fromHash('$argon2id$fakehash'),
      createdAt: new Date('2026-04-19T12:00:00Z'),
    });
  }

  it('saves and finds by email', async () => {
    await repo.save(makeUser());
    const found = await repo.findByEmail(Email.create('test@example.com'));
    expect(found).not.toBeNull();
    expect(found!.email.value).toBe('test@example.com');
  });

  it('saves and finds by id', async () => {
    const user = makeUser();
    await repo.save(user);
    const found = await repo.findById(user.id);
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(user.id.value);
  });

  it('returns null for unknown email', async () => {
    const found = await repo.findByEmail(Email.create('nobody@example.com'));
    expect(found).toBeNull();
  });

  it('returns null for unknown id', async () => {
    const found = await repo.findById(UserId.create('c0000000-0000-0000-0000-000000000009'));
    expect(found).toBeNull();
  });

  it('rejects duplicate email (DB UNIQUE constraint)', async () => {
    await repo.save(makeUser({ id: 'b0000000-0000-0000-0000-000000000001' }));
    const dup = makeUser({ id: 'b0000000-0000-0000-0000-000000000002' });
    await expect(repo.save(dup)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Implement PostgresUserRepository**

Create `src/auth/infrastructure/persistence/postgres-user.repository.ts`:

```typescript
import type { PrismaClient } from '@prisma/client';
import type { UserRepository } from '@auth/domain/ports/user-repository.port';
import { User } from '@auth/domain/aggregates/user';
import type { Email } from '@auth/domain/value-objects/email';
import type { UserId } from '@auth/domain/value-objects/user-id';

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async save(user: User): Promise<void> {
    const snap = user.toSnapshot();
    await this.prisma.user.create({
      data: {
        id: snap.id,
        email: snap.email,
        passwordHash: snap.passwordHash,
        createdAt: snap.createdAt,
      },
    });
  }

  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { email: email.value },
    });
    if (!row) return null;
    return User.fromSnapshot({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
    });
  }

  async findById(id: UserId): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: id.value },
    });
    if (!row) return null;
    return User.fromSnapshot({
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
    });
  }
}
```

- [ ] **Step 3: Run integration tests**

```bash
npx jest test/integration/distributed/postgres-user --no-coverage
```

- [ ] **Step 4: Commit**

```bash
git add src/auth/infrastructure/persistence/postgres-user.repository.ts test/integration/distributed/postgres-user.repository.spec.ts
git commit -m "feat(auth): add PostgresUserRepository + integration tests"
```

---

### Task 11: JWT Strategy + JwtAuthGuard + CurrentUser Decorator

**Files:**
- Create: `src/auth/infrastructure/security/jwt.strategy.ts`
- Create: `src/auth/infrastructure/security/jwt-auth.guard.ts`
- Create: `src/auth/infrastructure/security/current-user.decorator.ts`

- [ ] **Step 1: Implement JWT strategy**

Create `src/auth/infrastructure/security/jwt.strategy.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthenticatedUser } from '@shared/auth/authenticated-user';

interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(secret: string) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return { id: payload.sub, email: payload.email };
  }
}
```

- [ ] **Step 2: Implement JwtAuthGuard**

Create `src/auth/infrastructure/security/jwt-auth.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 3: Implement CurrentUser decorator**

Create `src/auth/infrastructure/security/current-user.decorator.ts`:

```typescript
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '@shared/auth/authenticated-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
```

- [ ] **Step 4: Verify typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/auth/infrastructure/security/jwt.strategy.ts src/auth/infrastructure/security/jwt-auth.guard.ts src/auth/infrastructure/security/current-user.decorator.ts
git commit -m "feat(auth): add JWT strategy, guard, and CurrentUser decorator"
```

---

### Task 12: Auth DTOs + AuthController + Unit Tests

**Files:**
- Create: `src/auth/infrastructure/consumer/http/dto/register.request.ts`
- Create: `src/auth/infrastructure/consumer/http/dto/login.request.ts`
- Create: `src/auth/infrastructure/consumer/http/auth.controller.ts`
- Create: `test/unit/auth/infrastructure/consumer/http/auth.controller.spec.ts`

- [ ] **Step 1: Create DTOs**

Create `src/auth/infrastructure/consumer/http/dto/register.request.ts`:

```typescript
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export class RegisterRequestDto extends createZodDto(RegisterRequestSchema) {}
```

Create `src/auth/infrastructure/consumer/http/dto/login.request.ts`:

```typescript
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export class LoginRequestDto extends createZodDto(LoginRequestSchema) {}
```

- [ ] **Step 2: Write AuthController tests**

Create `test/unit/auth/infrastructure/consumer/http/auth.controller.spec.ts`:

```typescript
import { AuthController } from '@auth/infrastructure/consumer/http/auth.controller';
import { RegisterUseCase } from '@auth/application/use-cases/register.use-case';
import { LoginUseCase } from '@auth/application/use-cases/login.use-case';
import { InMemoryUserRepository } from '@auth/infrastructure/persistence/in-memory-user.repository';
import { FakePasswordHasher } from '@auth/infrastructure/security/fake-password-hasher';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { User } from '@auth/domain/aggregates/user';
import { UserId } from '@auth/domain/value-objects/user-id';
import { Email } from '@auth/domain/value-objects/email';

describe('AuthController', () => {
  let controller: AuthController;
  let repo: InMemoryUserRepository;
  let hasher: FakePasswordHasher;
  let jwtService: JwtService;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    hasher = new FakePasswordHasher();
    jwtService = new JwtService({ secret: 'test-secret-minimum-32-chars-long!!' });
    const registerUseCase = new RegisterUseCase(repo, hasher);
    const loginUseCase = new LoginUseCase(repo, hasher);
    controller = new AuthController(registerUseCase, loginUseCase, jwtService, repo);
  });

  describe('POST /auth/register', () => {
    it('returns 201 with accessToken and user', async () => {
      const result = await controller.register({
        email: 'new@example.com',
        password: 'StrongPass1!',
      });
      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe('new@example.com');
      expect(result.user.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('throws ConflictException on duplicate email', async () => {
      await controller.register({ email: 'dup@example.com', password: 'StrongPass1!' });
      await expect(
        controller.register({ email: 'dup@example.com', password: 'AnotherPass!' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await controller.register({ email: 'user@example.com', password: 'CorrectPass!' });
    });

    it('returns 200 with accessToken and user', async () => {
      const result = await controller.login({
        email: 'user@example.com',
        password: 'CorrectPass!',
      });
      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe('user@example.com');
    });

    it('throws UnauthorizedException on wrong email', async () => {
      await expect(
        controller.login({ email: 'wrong@example.com', password: 'CorrectPass!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException on wrong password', async () => {
      await expect(
        controller.login({ email: 'user@example.com', password: 'WrongPass!' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('GET /auth/me', () => {
    it('returns user data for authenticated user', async () => {
      const registered = await controller.register({
        email: 'me@example.com',
        password: 'MyPass123!',
      });
      const me = await controller.me({ id: registered.user.id, email: 'me@example.com' });
      expect(me.id).toBe(registered.user.id);
      expect(me.email).toBe('me@example.com');
    });

    it('throws UnauthorizedException if user no longer exists', async () => {
      await expect(
        controller.me({ id: '550e8400-e29b-41d4-a716-446655440099', email: 'ghost@example.com' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx jest test/unit/auth/infrastructure/consumer/http/auth.controller --no-coverage
```

- [ ] **Step 4: Implement AuthController**

Create `src/auth/infrastructure/consumer/http/auth.controller.ts`:

```typescript
import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RegisterUseCase } from '@auth/application/use-cases/register.use-case';
import { LoginUseCase } from '@auth/application/use-cases/login.use-case';
import { EmailAlreadyExistsError } from '@auth/domain/errors/email-already-exists.error';
import { InvalidCredentialsError } from '@auth/domain/errors/invalid-credentials.error';
import type { UserRepository } from '@auth/domain/ports/user-repository.port';
import { UserId } from '@auth/domain/value-objects/user-id';
import { JwtAuthGuard } from '../security/jwt-auth.guard';
import { CurrentUser } from '../security/current-user.decorator';
import { RegisterRequestDto } from './dto/register.request';
import { LoginRequestDto } from './dto/login.request';
import type { AuthenticatedUser } from '@shared/auth/authenticated-user';

interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; createdAt: string };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterRequestDto): Promise<AuthResponse> {
    try {
      const result = await this.registerUseCase.execute(dto);
      const token = this.signToken(result.id, result.email);
      return {
        accessToken: token,
        user: { id: result.id, email: result.email, createdAt: result.createdAt.toISOString() },
      };
    } catch (err) {
      if (err instanceof EmailAlreadyExistsError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginRequestDto): Promise<AuthResponse> {
    try {
      const result = await this.loginUseCase.execute(dto);
      const token = this.signToken(result.id, result.email);
      return {
        accessToken: token,
        user: { id: result.id, email: result.email, createdAt: result.createdAt.toISOString() },
      };
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        throw new UnauthorizedException(err.message);
      }
      throw err;
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<{ id: string; email: string; createdAt: string }> {
    const user = await this.userRepository.findById(UserId.create(authUser.id));
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return {
      id: user.id.value,
      email: user.email.value,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private signToken(userId: string, email: string): string {
    return this.jwtService.sign({ sub: userId, email });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx jest test/unit/auth/infrastructure/consumer/http/auth.controller --no-coverage
```

- [ ] **Step 6: Commit**

```bash
git add src/auth/infrastructure/consumer/ test/unit/auth/infrastructure/consumer/
git commit -m "feat(auth): add AuthController with register/login/me endpoints"
```

---

### Task 13: AuthModule Wiring + Smoke Test

**Files:**
- Create: `src/auth/auth.module.ts`
- Modify: `src/app.module.ts`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Implement AuthModule**

Create `src/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { AppConfig } from '@shared/config/config.schema';
import { AUTH_GUARD } from '@shared/auth/auth.constants';
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { JwtStrategy } from './infrastructure/security/jwt.strategy';
import { JwtAuthGuard } from './infrastructure/security/jwt-auth.guard';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher';
import { AuthController } from './infrastructure/consumer/http/auth.controller';
import type { UserRepository } from './domain/ports/user-repository.port';
import type { PasswordHasher } from './domain/ports/password-hasher.port';

const USER_REPOSITORY = Symbol('UserRepository');
const PASSWORD_HASHER = Symbol('PasswordHasher');

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', { infer: true }) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: JwtStrategy,
      useFactory: (config: ConfigService<AppConfig, true>) =>
        new JwtStrategy(config.get('JWT_SECRET', { infer: true })),
      inject: [ConfigService],
    },
    { provide: AUTH_GUARD, useClass: JwtAuthGuard },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    {
      provide: USER_REPOSITORY,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const mode = config.get('PERSISTENCE_MODE', { infer: true });
        if (mode === 'postgres') {
          const { getPrismaClient } = await import('../shared/infrastructure/prisma.client');
          const { PostgresUserRepository } = await import(
            './infrastructure/persistence/postgres-user.repository'
          );
          const prisma = getPrismaClient(config.get('DATABASE_URL', { infer: true }));
          return new PostgresUserRepository(prisma);
        }
        const { InMemoryUserRepository } = await import(
          './infrastructure/persistence/in-memory-user.repository'
        );
        return new InMemoryUserRepository();
      },
      inject: [ConfigService],
    },
    {
      provide: RegisterUseCase,
      useFactory: (repo: UserRepository, hasher: PasswordHasher) =>
        new RegisterUseCase(repo, hasher),
      inject: [USER_REPOSITORY, PASSWORD_HASHER],
    },
    {
      provide: LoginUseCase,
      useFactory: (repo: UserRepository, hasher: PasswordHasher) =>
        new LoginUseCase(repo, hasher),
      inject: [USER_REPOSITORY, PASSWORD_HASHER],
    },
    {
      provide: AuthController,
      useFactory: (
        register: RegisterUseCase,
        login: LoginUseCase,
        jwtService: any,
        repo: UserRepository,
      ) => new AuthController(register, login, jwtService, repo),
      inject: [RegisterUseCase, LoginUseCase, JwtModule, USER_REPOSITORY],
    },
  ],
  exports: [AUTH_GUARD, JwtAuthGuard],
})
export class AuthModule {}
```

**Important:** The `AuthController` factory injection of `JwtModule` may not work directly. The `JwtService` is auto-provided by `JwtModule.registerAsync()`. Remove the explicit AuthController factory — NestJS can auto-inject if constructor params use proper decorators. Adjust as follows:

Replace the explicit `AuthController` provider with standard auto-injection by adding `@Inject()` decorators. Since `AuthController` constructor takes `UserRepository` which is a custom token, use `@Inject(USER_REPOSITORY)` in the controller. But `USER_REPOSITORY` is local to the module...

**Revised approach:** Export `USER_REPOSITORY` symbol from the module and use `@Inject()` in the controller. OR use a simpler explicit factory:

```typescript
{
  provide: AuthController,
  useFactory: (
    register: RegisterUseCase,
    login: LoginUseCase,
    jwtService: JwtService,
    repo: UserRepository,
  ) => new AuthController(register, login, jwtService, repo),
  inject: [RegisterUseCase, LoginUseCase, JwtService, USER_REPOSITORY],
},
```

(Import `JwtService` from `@nestjs/jwt` and inject it directly.)

- [ ] **Step 2: Add AuthModule to AppModule**

In `src/app.module.ts`, change:

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

to:

```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';
import { SimulationModule } from './simulation/simulation.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [AppConfigModule, AuthModule, SimulationModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 3: Add JWT_SECRET to docker-compose.yml**

Add to ALL `environment` sections (orchestrator + workers):

```yaml
JWT_SECRET: 'dev-secret-minimum-32-characters-long-for-hmac'
JWT_EXPIRES_IN: 900
```

- [ ] **Step 4: Verify typecheck passes**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Run existing tests to check no regressions**

```bash
npx jest --no-coverage
```

Fix any issues.

- [ ] **Step 6: Commit**

```bash
git add src/auth/auth.module.ts src/app.module.ts docker-compose.yml
git commit -m "feat(auth): wire AuthModule into app with JWT + Passport"
```

---

### Task 14: Ownership Refactor — Domain (Aggregate + Ports + ThrottlePolicy)

**Files:**
- Modify: `src/simulation/domain/aggregates/simulation.ts`
- Modify: `src/simulation/domain/ports/simulation-repository.port.ts`
- Modify: `src/simulation/domain/ports/throttle-policy.port.ts`
- Modify: `test/unit/domain/aggregates/simulation.spec.ts`
- Modify: `test/unit/infrastructure/policies/five-second-cooldown.policy.spec.ts`

- [ ] **Step 1: Refactor Simulation aggregate**

In `src/simulation/domain/aggregates/simulation.ts`:

1. Remove `import { OwnershipToken }` line.
2. Change `SimulationSnapshot.ownerToken: string` to `ownerId: string`.
3. Change `CreateSimulationInput.ownerToken: OwnershipToken` to `ownerId: string`.
4. Change constructor parameter from `OwnerToken: OwnershipToken` to `ownerId: string`.
5. Update `create()`, `fromSnapshot()`, `toSnapshot()` accordingly.

The full refactored file:

```typescript
import { SimulationId } from '../value-objects/simulation-id';
import { SimulationName } from '../value-objects/simulation-name';
import type { Match } from '../value-objects/match';
import type { TeamId } from '../value-objects/team-id';
import { ScoreBoard } from '../value-objects/score-board';
import { InvalidStateError, type SimulationState } from '../errors/invalid-state.error';
import type { DomainEvent } from '../events/domain-event';
import { SimulationStarted } from '../events/simulation-started';
import { GoalScored } from '../events/goal-scored';
import { SimulationFinished, type FinishReason } from '../events/simulation-finished';
import { SimulationRestarted } from '../events/simulation-restarted';

export interface SimulationSnapshot {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly state: SimulationState;
  readonly score: ReturnType<ScoreBoard['snapshot']>;
  readonly totalGoals: number;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly profileId: string;
}

export interface CreateSimulationInput {
  readonly id: SimulationId;
  readonly ownerId: string;
  readonly name: SimulationName;
  readonly matches: readonly Match[];
  readonly profileId: string;
  readonly now: Date;
}

export class Simulation {
  private pendingEvents: DomainEvent[] = [];

  private constructor(
    public readonly id: SimulationId,
    public readonly ownerId: string,
    public readonly name: SimulationName,
    public readonly profileId: string,
    private state: SimulationState,
    private score: ScoreBoard,
    private startedAt: Date,
    private finishedAt: Date | null,
    private totalGoals: number,
  ) {}

  static create(input: CreateSimulationInput): Simulation {
    const scoreBoard = ScoreBoard.fromMatches(input.matches);
    const sim = new Simulation(
      input.id,
      input.ownerId,
      input.name,
      input.profileId,
      'RUNNING',
      scoreBoard,
      input.now,
      null,
      0,
    );
    sim.pendingEvents.push(new SimulationStarted(input.id, input.now));
    return sim;
  }

  static fromSnapshot(snapshot: SimulationSnapshot, matches: readonly Match[]): Simulation {
    return new Simulation(
      SimulationId.create(snapshot.id),
      snapshot.ownerId,
      SimulationName.create(snapshot.name),
      snapshot.profileId,
      snapshot.state,
      ScoreBoard.fromSnapshot(snapshot.score, matches),
      new Date(snapshot.startedAt),
      snapshot.finishedAt ? new Date(snapshot.finishedAt) : null,
      snapshot.totalGoals,
    );
  }

  pullEvents(): readonly DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  applyGoal(teamId: TeamId, now: Date): void {
    if (this.state !== 'RUNNING') {
      throw new InvalidStateError(this.state, 'apply goal to');
    }
    this.score = this.score.increment(teamId);
    this.totalGoals++;
    this.pendingEvents.push(
      new GoalScored(this.id, teamId, this.score.snapshot(), this.totalGoals, now),
    );
  }

  finish(reason: FinishReason, now: Date): void {
    if (this.state !== 'RUNNING') {
      throw new InvalidStateError(this.state, 'finish');
    }
    this.state = 'FINISHED';
    this.finishedAt = now;
    this.pendingEvents.push(
      new SimulationFinished(this.id, reason, this.score.snapshot(), this.totalGoals, now),
    );
  }

  restart(now: Date): void {
    if (this.state !== 'FINISHED') {
      throw new InvalidStateError(this.state, 'restart');
    }
    this.state = 'RUNNING';
    this.score = this.score.reset();
    this.totalGoals = 0;
    this.startedAt = now;
    this.finishedAt = null;
    this.pendingEvents.push(new SimulationRestarted(this.id, now));
  }

  toSnapshot(): SimulationSnapshot {
    return {
      id: this.id.value,
      ownerId: this.ownerId,
      name: this.name.value,
      state: this.state,
      score: this.score.snapshot(),
      totalGoals: this.totalGoals,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      profileId: this.profileId,
    };
  }
}
```

- [ ] **Step 2: Refactor SimulationRepository port**

Replace `src/simulation/domain/ports/simulation-repository.port.ts`:

```typescript
import type { Simulation } from '../aggregates/simulation';
import type { SimulationId } from '../value-objects/simulation-id';

export interface SimulationRepository {
  save(simulation: Simulation): Promise<void>;
  findById(id: SimulationId): Promise<Simulation | null>;
  findAll(): Promise<readonly Simulation[]>;
  findByOwner(ownerId: string): Promise<readonly Simulation[]>;
  findLastStartedAtByOwner(ownerId: string): Promise<Date | null>;
  delete(id: SimulationId): Promise<void>;
}
```

- [ ] **Step 3: Refactor ThrottlePolicy port**

Replace `src/simulation/domain/ports/throttle-policy.port.ts`:

```typescript
export interface ThrottlePolicy {
  // userId retained for future per-user rate limiting (e.g. premium tiers with different cooldowns)
  canIgnite(userId: string, lastIgnitionAt: Date | null, now: Date): boolean;
}
```

- [ ] **Step 4: Refactor FiveSecondCooldownPolicy**

Replace `src/simulation/infrastructure/policies/five-second-cooldown.policy.ts`:

```typescript
import type { ThrottlePolicy } from '@simulation/domain/ports/throttle-policy.port';

export class FiveSecondCooldownPolicy implements ThrottlePolicy {
  constructor(private readonly cooldownMs: number = 5000) {}

  canIgnite(_userId: string, lastIgnitionAt: Date | null, now: Date): boolean {
    if (lastIgnitionAt === null) return true;
    return now.getTime() - lastIgnitionAt.getTime() >= this.cooldownMs;
  }
}
```

- [ ] **Step 5: Update simulation aggregate tests**

In `test/unit/domain/aggregates/simulation.spec.ts`, replace all `ownerToken` references with `ownerId`:

- Replace `import { OwnershipToken }` with nothing (remove the import).
- Replace `const token = OwnershipToken.create('550e8400-e29b-41d4-a716-446655440001');` with `const ownerId = '550e8400-e29b-41d4-a716-446655440001';`.
- Replace `ownerToken: token` with `ownerId` in all `Simulation.create()` calls.
- Replace `snap.ownerToken` assertions with `snap.ownerId`.
- Replace `snap.ownerToken` in `fromSnapshot()` calls with `ownerId`.

- [ ] **Step 6: Update throttle policy tests**

In `test/unit/infrastructure/policies/five-second-cooldown.policy.spec.ts`:

- Remove `import { OwnershipToken }` line.
- Replace `const token = OwnershipToken.create(...)` with `const userId = 'test-user-id';`.
- Replace `policy.canIgnite(token, ...)` with `policy.canIgnite(userId, ...)` in all calls.

- [ ] **Step 7: Run tests to verify domain layer compiles and passes**

```bash
npx jest test/unit/domain/ test/unit/infrastructure/policies/ --no-coverage
```

Some tests may still fail due to orchestrator/repo changes — that's expected, fixed in next tasks.

- [ ] **Step 8: Commit**

```bash
git add src/simulation/domain/ src/simulation/infrastructure/policies/ test/unit/domain/ test/unit/infrastructure/policies/
git commit -m "refactor(simulation): ownerToken → ownerId in aggregate, ports, ThrottlePolicy"
```

---

### Task 15: Ownership Refactor — Orchestrator + Errors

**Files:**
- Modify: `src/simulation/application/orchestrator/simulation-orchestrator.ts`
- Modify: `src/simulation/application/orchestrator/orchestrator.errors.ts`
- Modify: `test/unit/application/orchestrator/simulation-orchestrator.spec.ts`

- [ ] **Step 1: Refactor orchestrator errors**

Replace `src/simulation/application/orchestrator/orchestrator.errors.ts`:

```typescript
import { DomainError } from '@simulation/domain/errors/domain.error';

export class SimulationNotFoundError extends DomainError {
  constructor(public readonly simulationId: string) {
    super(`Simulation not found: ${simulationId}`);
  }
}

export class OwnershipMismatchError extends DomainError {
  constructor(public readonly simulationId: string) {
    super(`User does not own simulation ${simulationId}`);
  }
}

export class ThrottledError extends DomainError {
  constructor(public readonly cooldownMs: number) {
    super(`Start rejected: cooldown ${cooldownMs}ms not elapsed`);
  }
}
```

`UnknownTokenError` is removed — JWT guard handles auth.

- [ ] **Step 2: Refactor orchestrator**

Replace `src/simulation/application/orchestrator/simulation-orchestrator.ts`:

```typescript
import { randomUUID } from 'crypto';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { InvalidStateError } from '@simulation/domain/errors/invalid-state.error';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import type { SimulationSnapshot } from '@simulation/domain/aggregates/simulation';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { Clock } from '@simulation/domain/ports/clock.port';
import type { ThrottlePolicy } from '@simulation/domain/ports/throttle-policy.port';
import type { EventPublisher } from '@simulation/domain/ports/event-publisher.port';
import type { CommandBus } from '@shared/messaging/command-bus.port';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import { runSimulationCommand } from '../commands/run-simulation.command';
import { abortSimulationCommand } from '../commands/abort-simulation.command';
import { SIMULATION_TOPICS } from '../commands/simulation-topics';
import {
  SimulationNotFoundError,
  OwnershipMismatchError,
  ThrottledError,
} from './orchestrator.errors';

export interface StartSimulationInput {
  readonly userId: string;
  readonly name: string;
  readonly profileId?: string;
}

export interface StartSimulationResult {
  readonly simulationId: string;
  readonly state: 'RUNNING';
  readonly initialSnapshot: SimulationSnapshot;
}

export interface FinishSimulationInput {
  readonly simulationId: SimulationId;
  readonly userId: string;
}

export interface RestartSimulationInput {
  readonly simulationId: SimulationId;
  readonly userId: string;
}

export interface SimulationOrchestratorDeps {
  readonly simulationRepository: SimulationRepository;
  readonly throttlePolicy: ThrottlePolicy;
  readonly commandBus: CommandBus;
  readonly eventPublisher: EventPublisher;
  readonly clock: Clock;
  readonly cooldownMs: number;
  readonly defaultProfileId: string;
}

export class SimulationOrchestrator {
  constructor(private readonly deps: SimulationOrchestratorDeps) {}

  async startSimulation(input: StartSimulationInput): Promise<StartSimulationResult> {
    const name = SimulationName.create(input.name);
    const profileId = input.profileId ?? this.deps.defaultProfileId;
    const now = this.deps.clock.now();

    await this.ensureCanIgnite(input.userId, now);

    const simulationId = SimulationId.create(randomUUID());
    const sim = Simulation.create({
      id: simulationId,
      ownerId: input.userId,
      name,
      matches: PRESET_MATCHES,
      profileId,
      now,
    });

    await this.deps.simulationRepository.save(sim);
    for (const evt of sim.pullEvents()) {
      await this.deps.eventPublisher.publish(evt);
    }

    await this.deps.commandBus.dispatch(
      SIMULATION_TOPICS.RUN(profileId),
      runSimulationCommand(simulationId.value, profileId),
    );

    return {
      simulationId: simulationId.value,
      state: 'RUNNING',
      initialSnapshot: sim.toSnapshot(),
    };
  }

  async finishSimulation(input: FinishSimulationInput): Promise<void> {
    const sim = await this.findSimulationOrThrow(input.simulationId);
    this.assertOwnership(sim, input.userId);
    await this.deps.commandBus.dispatch(
      SIMULATION_TOPICS.ABORT,
      abortSimulationCommand(input.simulationId.value, this.deps.clock.now().getTime()),
    );
  }

  async restartSimulation(input: RestartSimulationInput): Promise<void> {
    const sim = await this.findSimulationOrThrow(input.simulationId);
    this.assertOwnership(sim, input.userId);
    const snapshot = sim.toSnapshot();
    if (snapshot.state !== 'FINISHED') {
      throw new InvalidStateError(snapshot.state, 'restart');
    }
    const now = this.deps.clock.now();
    await this.ensureCanIgnite(input.userId, now);
    sim.restart(now);
    await this.deps.simulationRepository.save(sim);
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

  private async ensureCanIgnite(userId: string, now: Date): Promise<void> {
    const lastStartedAt =
      await this.deps.simulationRepository.findLastStartedAtByOwner(userId);
    if (!this.deps.throttlePolicy.canIgnite(userId, lastStartedAt, now)) {
      throw new ThrottledError(this.deps.cooldownMs);
    }
  }

  private async findSimulationOrThrow(id: SimulationId): Promise<Simulation> {
    const sim = await this.deps.simulationRepository.findById(id);
    if (!sim) {
      throw new SimulationNotFoundError(id.value);
    }
    return sim;
  }

  private assertOwnership(sim: Simulation, userId: string): void {
    if (sim.ownerId !== userId) {
      throw new OwnershipMismatchError(sim.id.value);
    }
  }
}
```

- [ ] **Step 3: Rewrite orchestrator tests**

Replace `test/unit/application/orchestrator/simulation-orchestrator.spec.ts` with a test file that:

- Uses `InMemorySimulationRepository` (updated with `findLastStartedAtByOwner`)
- No longer uses `InMemoryOwnershipRepository`, `UuidOwnershipTokenGenerator`, `OwnershipToken`
- Uses `userId: string` instead of `ownershipToken`
- Removes `UnknownTokenError` tests
- Tests `assertOwnership` with `userId` comparison

Key changes in `buildWiring()`:

```typescript
function buildWiring() {
  const clock = new FakeClock(new Date('2026-04-18T12:00:00Z'));
  const simRepo = new InMemorySimulationRepository();
  const cmdBus = new InMemoryCommandBus();
  const eventBus = new InMemoryEventBus();
  const publisher = new InMemoryEventPublisher(eventBus);
  const throttle = new FiveSecondCooldownPolicy(COOLDOWN_MS);

  const orchestrator = new SimulationOrchestrator({
    simulationRepository: simRepo,
    throttlePolicy: throttle,
    commandBus: cmdBus,
    eventPublisher: publisher,
    clock,
    cooldownMs: COOLDOWN_MS,
    defaultProfileId: 'default',
  });

  return { clock, simRepo, cmdBus, eventBus, publisher, orchestrator };
}
```

Test calls change from `orchestrator.startSimulation({ name: 'Test' })` to `orchestrator.startSimulation({ userId: 'user-1', name: 'Test' })`.

Test for ownership mismatch: start with `userId: 'user-1'`, then finish with `userId: 'user-2'` → `OwnershipMismatchError`.

Test for throttle: start with same `userId` twice within cooldown → `ThrottledError`.

Write the full test file covering: happy path start, start returns correct snapshot, finish own sim, finish other user's sim (403), restart after finish, restart when running (409), throttle same user, throttle different users (both succeed), list/get simulations.

- [ ] **Step 4: Run tests**

```bash
npx jest test/unit/application/orchestrator/ --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add src/simulation/application/orchestrator/ test/unit/application/orchestrator/
git commit -m "refactor(simulation): orchestrator uses userId, remove OwnershipRepository dep"
```

---

### Task 16: Ownership Refactor — Infrastructure + Controller + Modules

**Files:**
- Modify: `src/simulation/infrastructure/persistence/in-memory-simulation.repository.ts`
- Modify: `src/simulation/infrastructure/persistence/postgres-simulation.repository.ts`
- Modify: `src/simulation/infrastructure/consumer/http/simulation.controller.ts`
- Modify: `src/simulation/infrastructure/consumer/http/domain-exception.filter.ts`
- Modify: `src/simulation/domain/ports/tokens.ts`
- Modify: `src/simulation/simulation.module.ts`
- Delete: `src/simulation/infrastructure/consumer/http/simulation-token.header.ts`
- Modify: `test/unit/infrastructure/persistence/in-memory-simulation.repository.spec.ts`
- Modify: `test/unit/infrastructure/consumer/http/simulation.controller.spec.ts`
- Modify: `test/unit/infrastructure/consumer/http/domain-exception.filter.spec.ts`

- [ ] **Step 1: Refactor InMemorySimulationRepository**

Replace `src/simulation/infrastructure/persistence/in-memory-simulation.repository.ts`:

```typescript
import type { Simulation } from '@simulation/domain/aggregates/simulation';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { SimulationId } from '@simulation/domain/value-objects/simulation-id';

export class InMemorySimulationRepository implements SimulationRepository {
  private readonly store = new Map<string, Simulation>();

  async save(simulation: Simulation): Promise<void> {
    this.store.set(simulation.id.value, simulation);
  }

  async findById(id: SimulationId): Promise<Simulation | null> {
    return this.store.get(id.value) ?? null;
  }

  async findAll(): Promise<readonly Simulation[]> {
    return Array.from(this.store.values());
  }

  async findByOwner(ownerId: string): Promise<readonly Simulation[]> {
    return Array.from(this.store.values()).filter((s) => s.ownerId === ownerId);
  }

  async findLastStartedAtByOwner(ownerId: string): Promise<Date | null> {
    let latest: Date | null = null;
    for (const sim of this.store.values()) {
      if (sim.ownerId !== ownerId) continue;
      const snap = sim.toSnapshot();
      if (!latest || snap.startedAt > latest) {
        latest = snap.startedAt;
      }
    }
    return latest;
  }

  async delete(id: SimulationId): Promise<void> {
    this.store.delete(id.value);
  }
}
```

- [ ] **Step 2: Refactor PostgresSimulationRepository**

Replace `src/simulation/infrastructure/persistence/postgres-simulation.repository.ts`:

```typescript
import type { PrismaClient, Prisma, Simulation as PrismaSimulation } from '@prisma/client';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { Match } from '@simulation/domain/value-objects/match';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import type { SimulationId } from '@simulation/domain/value-objects/simulation-id';

export class PostgresSimulationRepository implements SimulationRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly matches: readonly Match[],
  ) {}

  async save(sim: Simulation): Promise<void> {
    const snap = sim.toSnapshot();
    const data = {
      id: snap.id,
      name: snap.name,
      profileId: snap.profileId,
      state: snap.state,
      totalGoals: snap.totalGoals,
      startedAt: snap.startedAt,
      finishedAt: snap.finishedAt,
      ownerId: snap.ownerId,
      scoreSnapshot: snap.score as unknown as Prisma.InputJsonValue,
    };
    await this.prisma.simulation.upsert({
      where: { id: snap.id },
      create: data,
      update: data,
    });
  }

  async findById(id: SimulationId): Promise<Simulation | null> {
    const row = await this.prisma.simulation.findUnique({ where: { id: id.value } });
    if (!row) return null;
    return this.toAggregate(row);
  }

  async findAll(): Promise<readonly Simulation[]> {
    const rows = await this.prisma.simulation.findMany({ orderBy: { startedAt: 'desc' } });
    return rows.map((r) => this.toAggregate(r));
  }

  async findByOwner(ownerId: string): Promise<readonly Simulation[]> {
    const rows = await this.prisma.simulation.findMany({
      where: { ownerId },
      orderBy: { startedAt: 'desc' },
    });
    return rows.map((r) => this.toAggregate(r));
  }

  async findLastStartedAtByOwner(ownerId: string): Promise<Date | null> {
    const row = await this.prisma.simulation.findFirst({
      where: { ownerId },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    });
    return row?.startedAt ?? null;
  }

  async delete(id: SimulationId): Promise<void> {
    try {
      await this.prisma.simulation.delete({ where: { id: id.value } });
    } catch (err: unknown) {
      if (err != null && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
        return;
      }
      throw err;
    }
  }

  private toAggregate(row: PrismaSimulation): Simulation {
    return Simulation.fromSnapshot(
      {
        id: row.id,
        name: row.name,
        profileId: row.profileId,
        state: row.state as 'RUNNING' | 'FINISHED',
        totalGoals: row.totalGoals,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        ownerId: row.ownerId,
        score: row.scoreSnapshot as unknown as Array<{
          matchId: string;
          home: number;
          away: number;
        }>,
      },
      this.matches,
    );
  }
}
```

- [ ] **Step 3: Refactor SimulationController**

Replace `src/simulation/infrastructure/consumer/http/simulation.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SimulationOrchestrator } from '@simulation/application/orchestrator/simulation-orchestrator';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { JwtAuthGuard } from '@auth/infrastructure/security/jwt-auth.guard';
import { CurrentUser } from '@auth/infrastructure/security/current-user.decorator';
import { CreateSimulationRequestDto } from './dto/create-simulation.request';
import type { SimulationSnapshot } from '@simulation/domain/aggregates/simulation';
import type { AuthenticatedUser } from '@shared/auth/authenticated-user';

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
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateSimulationRequestDto,
  ): Promise<{
    simulationId: string;
    state: 'RUNNING';
    initialSnapshot: SimulationResponseShape;
  }> {
    const result = await this.orchestrator.startSimulation({
      userId: user.id,
      name: body.name,
      profileId: body.profile,
    });
    return {
      simulationId: result.simulationId,
      state: result.state,
      initialSnapshot: toResponse(result.initialSnapshot),
    };
  }

  @Post(':id/finish')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  async finish(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.orchestrator.finishSimulation({
      simulationId: SimulationId.create(id),
      userId: user.id,
    });
  }

  @Post(':id/restart')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(JwtAuthGuard)
  async restart(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.orchestrator.restartSimulation({
      simulationId: SimulationId.create(id),
      userId: user.id,
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

- [ ] **Step 4: Refactor DomainExceptionFilter — remove UnknownTokenError**

In `src/simulation/infrastructure/consumer/http/domain-exception.filter.ts`:

- Remove `UnknownTokenError` from the import.
- Remove the `if (exception instanceof UnknownTokenError)` block (lines 75-79).

- [ ] **Step 5: Remove OWNERSHIP_* tokens**

In `src/simulation/domain/ports/tokens.ts`, remove:

```typescript
OWNERSHIP_TOKEN_GENERATOR: Symbol('OwnershipTokenGenerator'),
OWNERSHIP_REPOSITORY: Symbol('OwnershipRepository'),
```

- [ ] **Step 6: Delete simulation-token.header.ts**

```bash
rm src/simulation/infrastructure/consumer/http/simulation-token.header.ts
```

- [ ] **Step 7: Refactor SimulationModule**

Replace `src/simulation/simulation.module.ts` — remove all `OwnershipModule` imports, `OwnershipRepository`, `OwnershipTokenGenerator`, `UuidOwnershipTokenGenerator` references. The `SimulationOrchestrator` factory no longer needs `ownerRepo`, `tokenGen`. Remove `PORT_TOKENS.OWNERSHIP_REPOSITORY` and `PORT_TOKENS.OWNERSHIP_TOKEN_GENERATOR` from inject arrays.

Key changes:
- Remove `import { OwnershipModule }` and `imports: [OwnershipModule]`
- Remove `PORT_TOKENS.OWNERSHIP_TOKEN_GENERATOR` provider
- Update `SimulationOrchestrator` factory to match new deps interface
- Remove all OwnershipRepository and OwnershipTokenGenerator references

- [ ] **Step 8: Update simulation.controller.spec.ts, domain-exception.filter.spec.ts, in-memory-simulation.repository.spec.ts**

Update all test files to remove `OwnershipToken` references and use `ownerId: string` instead. Remove `UnknownTokenError` test cases from filter spec.

- [ ] **Step 9: Run all tests**

```bash
npx jest --no-coverage
```

Fix any remaining compilation errors.

- [ ] **Step 10: Commit**

```bash
git add src/simulation/ test/unit/
git commit -m "refactor(simulation): replace OwnershipToken with userId across infrastructure"
```

---

### Task 17: Delete Ownership Module + Final Migration + Cleanup

**Files:**
- Delete: `src/ownership/` (entire directory)
- Delete: `test/unit/domain/value-objects/ownership-token.spec.ts`
- Delete: `test/unit/infrastructure/persistence/in-memory-ownership.repository.spec.ts`
- Delete: `test/unit/infrastructure/persistence/uuid-ownership-token.generator.spec.ts`
- Create: Prisma migration 3 (NOT NULL + drop owner_token)
- Modify: `tsconfig.json` — remove `@ownership/*` path

- [ ] **Step 1: Delete ownership module**

```bash
rm -rf src/ownership/
rm test/unit/domain/value-objects/ownership-token.spec.ts
rm test/unit/infrastructure/persistence/in-memory-ownership.repository.spec.ts
rm test/unit/infrastructure/persistence/uuid-ownership-token.generator.spec.ts
```

- [ ] **Step 2: Remove @ownership/* path from tsconfig.json**

In `tsconfig.json`, remove the `"@ownership/*"` line from `paths`:

```json
"paths": {
  "@simulation/*": ["src/simulation/*"],
  "@auth/*": ["src/auth/*"],
  "@shared/*": ["src/shared/*"]
}
```

- [ ] **Step 3: Create migration 3 — NOT NULL + drop owner_token**

```bash
mkdir -p prisma/migrations/20260419120200_finalize_owner_id
```

Create `prisma/migrations/20260419120200_finalize_owner_id/migration.sql`:

```sql
-- Finalize owner_id: set NOT NULL, add FK, drop legacy owner_token

ALTER TABLE "simulations" ALTER COLUMN "owner_id" SET NOT NULL;

ALTER TABLE "simulations"
  ADD CONSTRAINT "simulations_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop legacy ownership column and its index
DROP INDEX IF EXISTS "simulations_owner_token_idx";
ALTER TABLE "simulations" DROP COLUMN IF EXISTS "owner_token";
```

- [ ] **Step 4: Verify all tests pass**

```bash
npx jest --no-coverage
```

- [ ] **Step 5: Verify typecheck passes**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete ownership module, finalize owner_id migration"
```

---

### Task 18: E2E Auth Flow Tests

**Files:**
- Create: `test/e2e/auth-flow.e2e-spec.ts`

- [ ] **Step 1: Write auth E2E tests**

Create `test/e2e/auth-flow.e2e-spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Auth flow E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('registers and returns accessToken + user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'new@example.com', password: 'StrongPass1!' })
        .expect(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.user.email).toBe('new@example.com');
      expect(res.body.user.createdAt).toBeDefined();
    });

    it('rejects duplicate email with 409', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'dup@example.com', password: 'StrongPass1!' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'dup@example.com', password: 'AnotherPass!' })
        .expect(409);
    });

    it('rejects invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'StrongPass1!' })
        .expect(400);
    });

    it('rejects short password with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'short@example.com', password: 'Ab1!' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'login@example.com', password: 'CorrectPass!' });
    });

    it('returns accessToken on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'login@example.com', password: 'CorrectPass!' })
        .expect(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe('login@example.com');
    });

    it('rejects wrong email with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'wrong@example.com', password: 'CorrectPass!' })
        .expect(401);
    });

    it('rejects wrong password with 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'login@example.com', password: 'WrongPass!' })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    it('returns user data with valid Bearer token', async () => {
      const reg = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'me@example.com', password: 'MyPass123!' })
        .expect(201);
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${reg.body.accessToken}`)
        .expect(200);
      expect(res.body.id).toBe(reg.body.user.id);
      expect(res.body.email).toBe('me@example.com');
    });

    it('rejects request without token with 401', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('rejects malformed token with 401', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
    });
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
npx jest test/e2e/auth-flow --no-coverage
```

- [ ] **Step 3: Commit**

```bash
git add test/e2e/auth-flow.e2e-spec.ts
git commit -m "test(e2e): add auth flow tests (register, login, me, error cases)"
```

---

### Task 19: E2E Simulation + Auth Integration Tests

**Files:**
- Create: `test/e2e/simulation-auth.e2e-spec.ts`
- Modify: existing integration tests to use Bearer auth

- [ ] **Step 1: Write simulation + auth E2E tests**

Create `test/e2e/simulation-auth.e2e-spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { FakeClock } from '@simulation/infrastructure/time/fake-clock';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';

async function registerAndGetToken(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password: 'TestPass123!' })
    .expect(201);
  return res.body.accessToken;
}

describe('Simulation + Auth E2E', () => {
  let app: INestApplication;
  let clock: FakeClock;

  beforeEach(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PORT_TOKENS.CLOCK)
      .useValue(new FakeClock(new Date('2026-04-19T12:00:00Z')))
      .overrideProvider(PORT_TOKENS.RANDOM_PROVIDER)
      .useValue(new SeededRandomProvider(42))
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.init();
    clock = module.get(PORT_TOKENS.CLOCK) as FakeClock;
  });

  afterEach(async () => {
    await app.close();
  });

  it('start simulation with valid Bearer → 201', async () => {
    const token = await registerAndGetToken(app, 'user1@example.com');
    const res = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    expect(res.body.simulationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.state).toBe('RUNNING');
  });

  it('start simulation without Bearer → 401', async () => {
    await request(app.getHttpServer())
      .post('/simulations')
      .send({ name: 'Katar 2023' })
      .expect(401);
  });

  it('finish own simulation → 202', async () => {
    const token = await registerAndGetToken(app, 'owner@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/simulations/${created.body.simulationId}/finish`)
      .set('Authorization', `Bearer ${token}`)
      .expect(202);
  });

  it('finish someone else\'s simulation → 403', async () => {
    const token1 = await registerAndGetToken(app, 'owner1@example.com');
    const token2 = await registerAndGetToken(app, 'other@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/simulations/${created.body.simulationId}/finish`)
      .set('Authorization', `Bearer ${token2}`)
      .expect(403);
  });

  it('finish without Bearer → 401', async () => {
    const token = await registerAndGetToken(app, 'finisher@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/simulations/${created.body.simulationId}/finish`)
      .expect(401);
  });

  it('GET /simulations (no auth) → 200', async () => {
    await request(app.getHttpServer()).get('/simulations').expect(200);
  });

  it('GET /simulations/:id (no auth) → 200', async () => {
    const token = await registerAndGetToken(app, 'reader@example.com');
    const created = await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/simulations/${created.body.simulationId}`)
      .expect(200);
  });

  it('same user starts two sims within cooldown → 429', async () => {
    const token = await registerAndGetToken(app, 'throttle@example.com');
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Paryz 2024' })
      .expect(429);
  });

  it('two different users start simultaneously → both 201', async () => {
    const token1 = await registerAndGetToken(app, 'userA@example.com');
    const token2 = await registerAndGetToken(app, 'userB@example.com');
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: 'Katar 2023' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/simulations')
      .set('Authorization', `Bearer ${token2}`)
      .send({ name: 'Paryz 2024' })
      .expect(201);
  });
});
```

- [ ] **Step 2: Update existing integration tests**

Update `test/integration/http-lifecycle.e2e-spec.ts`, `http-manual-finish.e2e-spec.ts`, `http-restart.e2e-spec.ts`, `http-throttle-validation.e2e-spec.ts`, and `test/e2e/profile-param.e2e-spec.ts`:

For each test file:
1. Add a helper function to register a user and get a Bearer token.
2. Replace `.set('x-simulation-token', ownershipToken)` with `.set('Authorization', `Bearer ${token}`)`.
3. Replace references to `ownershipToken` in response bodies (the response no longer includes `ownershipToken`).
4. For `POST /simulations`, add `.set('Authorization', ...)` to all calls.

Each test file follows the same pattern as `simulation-auth.e2e-spec.ts` — call `POST /auth/register` first to get a token, then use it in simulation endpoints.

- [ ] **Step 3: Run all tests**

```bash
npx jest --no-coverage
```

- [ ] **Step 4: Commit**

```bash
git add test/
git commit -m "test(e2e): add simulation+auth E2E tests, update integration tests for Bearer auth"
```

---

### Task 20: Docs (README, CHANGELOG)

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update README**

Add to README:

- Phase 4b status section
- Auth endpoints documentation (POST /auth/register, POST /auth/login, GET /auth/me)
- Demo user credentials: `demo@sportradar.local` / `Demo1234!`
- Bearer token usage for simulation endpoints
- Updated env table with `JWT_SECRET`, `JWT_EXPIRES_IN`, `PASSWORD_MIN_LENGTH`
- Guard matrix (which endpoints require auth)

- [ ] **Step 2: Update CHANGELOG**

Add `[4.2.0]` entry for Phase 4b:

```markdown
## [4.2.0] — Phase 4b: Auth + Ownership Refactor

### Added
- JWT authentication with `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`
- User registration and login endpoints (`POST /auth/register`, `POST /auth/login`, `GET /auth/me`)
- `User` aggregate with `UserId`, `Email`, `HashedPassword` value objects
- `UserRepository` port with Postgres + in-memory implementations
- `PasswordHasher` port with argon2 + fake implementations
- `RegisterUseCase` + `LoginUseCase`
- `JwtAuthGuard` + `@CurrentUser()` decorator
- Shared `AuthenticatedUser` contract for loose coupling
- Prisma `User` model with email UNIQUE constraint
- Three-step non-destructive migration (add nullable → backfill → NOT NULL + drop)
- Demo user (`demo@sportradar.local` / `Demo1234!`) seeded via migration
- E2E tests for auth flow and simulation + auth integration
- ADR-009 (auth architecture) + ADR-010 (ownership retirement)

### Changed
- Simulation ownership: `ownerToken: OwnershipToken` → `ownerId: string` (user ID from JWT)
- `SimulationOrchestrator`: removed `ownershipRepository` + `tokenGenerator` deps
- `ThrottlePolicy`: parameter `OwnershipToken` → `string` (userId)
- `SimulationRepository.findByOwner`: `OwnershipToken` → `string`
- New `SimulationRepository.findLastStartedAtByOwner(ownerId)` replaces ownership-based throttle
- `SimulationController`: `@Headers('x-simulation-token')` → `@UseGuards(JwtAuthGuard) @CurrentUser()`
- Mutating simulation endpoints (start, finish, restart) now require Bearer token
- Read-only endpoints (list, get, WS) remain unauthenticated

### Removed
- `src/ownership/` module (entire directory — stepping stone retired)
- `OwnershipToken`, `OwnershipRepository`, `OwnershipTokenGenerator` ports
- `UnknownTokenError`
- `x-simulation-token` header
- `ownershipToken` from API responses
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: README Phase 4b status + auth docs + CHANGELOG [4.2.0]"
```

---

### Task 21: simplify

**Files:** Review all changed files.

- [ ] **Step 1: Run the `simplify` skill**

Review all changes from Phase 4b for:
- Code reuse opportunities
- Code quality issues
- Efficiency improvements

- [ ] **Step 2: Fix findings and commit**

```bash
git add -A
git commit -m "refactor: simplify review — Phase 4b cleanup"
```

---

### Task 22: Security Review + Git Tag

**Files:** Review all changed files for security.

- [ ] **Step 1: Run security review**

Focus areas:
- Password hashing (argon2 config, no plaintext leaks)
- JWT secret management (no hardcoded production secrets)
- SQL injection via Prisma (parameterized queries)
- Input validation (Zod DTOs on all endpoints)
- Auth guard coverage (all mutating endpoints protected)
- Timing attacks in login (constant-time comparison via argon2.verify)
- Error messages don't leak sensitive info (wrong email vs wrong password → same error)

- [ ] **Step 2: Fix findings and commit**

```bash
git add -A
git commit -m "fix(security): Phase 4b security review findings"
```

- [ ] **Step 3: Git tag**

```bash
git tag -a v4.2-auth-ownership -m "Phase 4b: JWT auth + ownership refactor"
```
