# Phase 0 — Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zainicjalizować projekt SportRadar z TypeScript strict + NestJS 10 + Zod, hexagonal folder structure (puste porty), Jest sanity test, multi-stage Dockerfile, docker-compose skeleton, GitHub Actions CI. End state: green CI + git tag `v0.1-scaffold`.

**Architecture:** Single-repo TypeScript NestJS application. Folder structure reflects hexagonal architecture (domain / application / infrastructure per bounded context `simulation/` + `ownership/` + `shared/`). Wszystkie porty w Fazie 0 to puste interfejsy (stuby) — implementacje w Fazie 1. Jeden proces, jeden Docker image.

**Tech Stack:** Node.js 20 LTS, TypeScript 5.x strict, NestJS 10.x, Zod + nestjs-zod, Jest + @nestjs/testing, ESLint (@typescript-eslint) + Prettier, npm (package manager), Docker (multi-stage, non-root), GitHub Actions.

**Spec reference:** `docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md` §9 Phase 0 + §11 Tech Stack.

**CLAUDE.md reference:** zasady decision logging — każda niebanalna zmiana vs ten plan = ADR w `docs/decisions/`.

---

## File Structure (Phase 0 creates these)

```
/
├── package.json                         # npm scripts, deps
├── package-lock.json                    # (auto-generated)
├── tsconfig.json                        # TS strict config
├── tsconfig.build.json                  # build-specific (exclude tests)
├── .eslintrc.cjs                        # ESLint config
├── .prettierrc                          # Prettier config
├── .prettierignore
├── .nvmrc                               # Node version pin
├── jest.config.ts                       # Jest root config
├── Dockerfile                           # Multi-stage
├── .dockerignore
├── docker-compose.yml                   # Skeleton (tylko app service)
├── .github/
│   └── workflows/
│       └── ci.yml                       # Lint + test
├── CHANGELOG.md                         # Keep a Changelog format
├── README.md                            # Setup, run, architecture link
├── src/
│   ├── main.ts                          # NestJS bootstrap
│   ├── app.module.ts                    # Root module (imports ConfigModule)
│   ├── shared/
│   │   ├── config/
│   │   │   ├── config.schema.ts         # Zod env schema
│   │   │   └── config.module.ts         # NestJS ConfigModule z Zod validation
│   │   ├── messaging/
│   │   │   ├── command-bus.port.ts      # interface stub
│   │   │   └── event-bus.port.ts        # interface stub
│   │   └── errors/
│   │       └── .gitkeep                 # placeholder
│   ├── simulation/
│   │   ├── domain/
│   │   │   ├── aggregates/.gitkeep
│   │   │   ├── value-objects/.gitkeep
│   │   │   ├── events/.gitkeep
│   │   │   └── ports/
│   │   │       ├── clock.port.ts
│   │   │       ├── random-provider.port.ts
│   │   │       ├── simulation-repository.port.ts
│   │   │       ├── event-publisher.port.ts
│   │   │       ├── simulation-engine.port.ts
│   │   │       ├── match-dynamics.port.ts
│   │   │       ├── retention-policy.port.ts
│   │   │       ├── throttle-policy.port.ts
│   │   │       └── tokens.ts            # Symbol injection tokens
│   │   ├── application/.gitkeep
│   │   └── infrastructure/.gitkeep
│   └── ownership/
│       ├── domain/
│       │   └── ports/
│       │       ├── ownership-repository.port.ts
│       │       └── ownership-token-generator.port.ts
│       └── infrastructure/.gitkeep
└── test/
    └── sanity.spec.ts                   # Single sanity test
```

**Uwaga o `.gitkeep`**: git nie śledzi pustych folderów. Używamy `.gitkeep` żeby utrzymać strukturę; w Fazie 1 pliki wyprą te placeholdery.

**Uwaga o plikach portów**: Faza 0 tworzy je jako *empty interfaces* (`export interface Clock {}`), tak że struktura jest gotowa i testy importów kompilują się. Faza 1 wypełni je właściwymi sygnaturami.

---

## Task 1: Initialize npm project + install core dependencies

**Files:**
- Create: `package.json`
- Create: `.nvmrc`
- Create: `package-lock.json` (auto)

- [ ] **Step 1: Create `.nvmrc`**

```
20
```

- [ ] **Step 2: Initialize npm project**

Run:
```bash
npm init -y
```

Expected: creates `package.json` with defaults.

- [ ] **Step 3: Overwrite `package.json` with project metadata and scripts**

```json
{
  "name": "sportradar-simulation",
  "version": "0.1.0",
  "private": true,
  "description": "SportRadar coding task: football match simulation API",
  "scripts": {
    "build": "nest build",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"test/**/*.ts\"",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/main",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "lint:fix": "eslint \"{src,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "typecheck": "tsc --noEmit"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 4: Install NestJS core runtime dependencies**

Run:
```bash
npm install @nestjs/common@^10 @nestjs/core@^10 @nestjs/platform-express@^10 reflect-metadata@^0.2 rxjs@^7
```

- [ ] **Step 5: Install Zod + nestjs-zod**

Run:
```bash
npm install zod@^3 nestjs-zod@^3
```

- [ ] **Step 6: Install dev dependencies (TS, NestJS CLI, Jest)**

Run:
```bash
npm install --save-dev @nestjs/cli@^10 @nestjs/schematics@^10 @nestjs/testing@^10 @types/express @types/node@^20 @types/jest@^29 @types/supertest jest@^29 supertest@^6 ts-jest@^29 ts-loader@^9 ts-node@^10 typescript@^5 source-map-support
```

- [ ] **Step 7: Install ESLint + Prettier dev deps**

Run:
```bash
npm install --save-dev eslint@^8 @typescript-eslint/eslint-plugin@^7 @typescript-eslint/parser@^7 eslint-config-prettier eslint-plugin-prettier prettier@^3
```

- [ ] **Step 8: Verify installation**

Run:
```bash
npm ls --depth=0
```

Expected: lista pakietów bez błędów `UNMET DEPENDENCY`.

---

## Task 2: Configure TypeScript strict

**Files:**
- Create: `tsconfig.json`
- Create: `tsconfig.build.json`

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "resolveJsonModule": true,
    "paths": {
      "@simulation/*": ["src/simulation/*"],
      "@ownership/*": ["src/ownership/*"],
      "@shared/*": ["src/shared/*"]
    }
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Create `tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*.spec.ts", "**/*.e2e-spec.ts"]
}
```

- [ ] **Step 3: Verify typecheck runs (may have no files yet — should still parse configs)**

Run:
```bash
npx tsc --noEmit
```

Expected: Exits with 0 (no errors, no files to compile yet).

---

## Task 3: Configure ESLint + Prettier

**Files:**
- Create: `.eslintrc.cjs`
- Create: `.prettierrc`
- Create: `.prettierignore`

- [ ] **Step 1: Create `.eslintrc.cjs`**

```js
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.cjs', 'dist', 'node_modules', 'coverage'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
  },
};
```

- [ ] **Step 2: Create `.prettierrc`**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [ ] **Step 3: Create `.prettierignore`**

```
dist
coverage
node_modules
*.md
package-lock.json
```

- [ ] **Step 4: Verify lint runs (should pass — no source files yet)**

Run:
```bash
npm run lint
```

Expected: `error  0 files matched` or similar — no failures.

---

## Task 4: Commit scaffolding configs

- [ ] **Step 1: Stage and commit**

```bash
git add .nvmrc package.json package-lock.json tsconfig.json tsconfig.build.json .eslintrc.cjs .prettierrc .prettierignore
git commit -m "chore: initialize npm project with TS strict, NestJS, Zod, ESLint, Prettier"
```

Expected: single commit with all config files.

---

## Task 5: NestJS bootstrap (main.ts + AppModule)

**Files:**
- Create: `src/main.ts`
- Create: `src/app.module.ts`

- [ ] **Step 1: Create `src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 2: Create `src/main.ts`**

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Application is running on port ${port}`);
}

void bootstrap();
```

- [ ] **Step 3: Verify build succeeds**

Run:
```bash
npx nest build
```

Expected: `dist/` folder created with `main.js` and `app.module.js`.

---

## Task 6: Zod env config schema

**Files:**
- Create: `src/shared/config/config.schema.ts`
- Create: `src/shared/config/config.module.ts`
- Create: `.env.example` (w root projektu — konwencja)

- [ ] **Step 1: Install `@nestjs/config`**

Run:
```bash
npm install @nestjs/config@^3
```

- [ ] **Step 2: Create `src/shared/config/config.schema.ts`**

```typescript
import { z } from 'zod';

export const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // Simulation config (Phase 1 defaults per spec §5.6)
  SIMULATION_DURATION_MS: z.coerce.number().int().positive().default(9000),
  GOAL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  GOAL_COUNT: z.coerce.number().int().positive().default(9),
  FIRST_GOAL_OFFSET_MS: z.coerce.number().int().nonnegative().default(1000),
  START_COOLDOWN_MS: z.coerce.number().int().nonnegative().default(5000),
  FINISHED_RETENTION_MS: z.coerce.number().int().positive().default(3_600_000),
  GC_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
```

- [ ] **Step 3: Create `src/shared/config/config.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigSchema } from './config.schema';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => {
        const parsed = ConfigSchema.safeParse(env);
        if (!parsed.success) {
          throw new Error(
            `Invalid environment configuration: ${JSON.stringify(parsed.error.format())}`,
          );
        }
        return parsed.data;
      },
    }),
  ],
})
export class AppConfigModule {}
```

- [ ] **Step 4: Create `.env.example` (w root projektu)**

```
NODE_ENV=development
PORT=3000

# Simulation config
SIMULATION_DURATION_MS=9000
GOAL_INTERVAL_MS=1000
GOAL_COUNT=9
FIRST_GOAL_OFFSET_MS=1000
START_COOLDOWN_MS=5000
FINISHED_RETENTION_MS=3600000
GC_INTERVAL_MS=300000
```

- [ ] **Step 5: Wire `AppConfigModule` into `AppModule`**

Modify `src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AppConfigModule } from './shared/config/config.module';

@Module({
  imports: [AppConfigModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 6: Verify build still succeeds**

Run:
```bash
npx nest build
```

Expected: builds with no errors.

---

## Task 7: Hexagonal folder structure + stub port files

**Files:** (all stubs — Phase 1 will fill signatures)
- Create: `src/simulation/domain/ports/tokens.ts`
- Create: `src/simulation/domain/ports/clock.port.ts`
- Create: `src/simulation/domain/ports/random-provider.port.ts`
- Create: `src/simulation/domain/ports/simulation-repository.port.ts`
- Create: `src/simulation/domain/ports/event-publisher.port.ts`
- Create: `src/simulation/domain/ports/simulation-engine.port.ts`
- Create: `src/simulation/domain/ports/match-dynamics.port.ts`
- Create: `src/simulation/domain/ports/retention-policy.port.ts`
- Create: `src/simulation/domain/ports/throttle-policy.port.ts`
- Create: `src/ownership/domain/ports/ownership-repository.port.ts`
- Create: `src/ownership/domain/ports/ownership-token-generator.port.ts`
- Create: `src/shared/messaging/command-bus.port.ts`
- Create: `src/shared/messaging/event-bus.port.ts`
- Create: `.gitkeep` w pustych folderach (patrz File Structure)

- [ ] **Step 1: Create `src/simulation/domain/ports/tokens.ts`**

```typescript
/**
 * DI injection tokens for simulation ports.
 * Phase 0: tokens defined; Phase 1: interfaces filled + providers wired.
 */
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
  OWNERSHIP_REPOSITORY: Symbol('OwnershipRepository'),
  COMMAND_BUS: Symbol('CommandBus'),
  EVENT_BUS: Symbol('EventBus'),
} as const;
```

- [ ] **Step 2: Create each port file as empty interface (stubs)**

Each of these files gets identical structure — empty interface + TODO comment pointing to Phase 1. Example for `src/simulation/domain/ports/clock.port.ts`:

```typescript
/**
 * Time abstraction port.
 * Phase 1 will define: now(): Date, sleep(ms: number): Promise<void>.
 */
export interface Clock {
  // Phase 1 signature
}
```

Apply the same pattern to each of these (text only — empty interface, doc comment):

- `random-provider.port.ts` — `export interface RandomProvider {}`
- `simulation-repository.port.ts` — `export interface SimulationRepository {}`
- `event-publisher.port.ts` — `export interface EventPublisher {}`
- `simulation-engine.port.ts` — `export interface SimulationEngine {}`
- `match-dynamics.port.ts` — `export interface MatchDynamics {}`
- `retention-policy.port.ts` — `export interface RetentionPolicy {}`
- `throttle-policy.port.ts` — `export interface ThrottlePolicy {}`
- `src/ownership/domain/ports/ownership-repository.port.ts` — `export interface OwnershipRepository {}`
- `src/ownership/domain/ports/ownership-token-generator.port.ts` — `export interface OwnershipTokenGenerator {}`
- `src/shared/messaging/command-bus.port.ts` — `export interface CommandBus {}`
- `src/shared/messaging/event-bus.port.ts` — `export interface EventBus {}`

- [ ] **Step 3: Create `.gitkeep` files for empty folders**

Run (bash):
```bash
touch src/simulation/domain/aggregates/.gitkeep
touch src/simulation/domain/value-objects/.gitkeep
touch src/simulation/domain/events/.gitkeep
touch src/simulation/application/.gitkeep
touch src/simulation/infrastructure/.gitkeep
touch src/ownership/infrastructure/.gitkeep
touch src/shared/errors/.gitkeep
```

- [ ] **Step 4: Verify build + lint**

Run:
```bash
npx nest build
npm run lint
```

Expected: both pass.

---

## Task 8: Jest setup + sanity test

**Files:**
- Create: `jest.config.ts`
- Create: `test/sanity.spec.ts`

- [ ] **Step 1: Create `jest.config.ts`**

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts'],
  coverageDirectory: 'coverage',
  moduleNameMapper: {
    '^@simulation/(.*)$': '<rootDir>/src/simulation/$1',
    '^@ownership/(.*)$': '<rootDir>/src/ownership/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },
};

export default config;
```

- [ ] **Step 2: Create `test/sanity.spec.ts`**

```typescript
describe('sanity', () => {
  it('jest wires up and runs TS', () => {
    expect(1 + 1).toBe(2);
  });

  it('can import from src via path alias', async () => {
    const mod = await import('@simulation/domain/ports/tokens');
    expect(mod.PORT_TOKENS.CLOCK).toBeDefined();
  });
});
```

- [ ] **Step 3: Run the sanity test**

Run:
```bash
npm test
```

Expected:
```
PASS  test/sanity.spec.ts
  sanity
    ✓ jest wires up and runs TS
    ✓ can import from src via path alias
```

- [ ] **Step 4: Commit NestJS bootstrap + config + structure + sanity test**

```bash
git add src/ test/ jest.config.ts
git commit -m "feat: NestJS bootstrap, Zod env config, hexagonal structure, sanity test"
```

---

## Task 9: Dockerfile (multi-stage, non-root)

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
dist
coverage
.git
.github
.env
.env.local
*.log
.vscode
.idea
docs
*.md
!README.md
TS-Coding-task.pdf
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.6

# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps with cache-friendly layer
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src ./src
COPY test ./test

RUN npm run build

# ---------- Stage 2: Production deps only ----------
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---------- Stage 3: Runner ----------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

USER app

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

- [ ] **Step 3: Build Docker image to verify**

Run:
```bash
docker build -t sportradar-simulation:phase-0 .
```

Expected: Successful build, `sportradar-simulation:phase-0` tagged.

- [ ] **Step 4: Run container to smoke test**

Run:
```bash
docker run --rm -p 3000:3000 --name sportradar-smoke sportradar-simulation:phase-0 &
sleep 3
curl -sf http://localhost:3000 || echo "expected 404 (no routes yet)"
docker stop sportradar-smoke
```

Expected: `curl` returns 404 (no routes registered yet). Brak błędu = container uruchomił się pomyślnie.

---

## Task 10: docker-compose skeleton (Phase 0 = app only)

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
# Phase 0 skeleton — only application service.
# Phase 2 will add: redis (for BullMQ), workers (N per profile).
# Phase 4 will add: postgres.

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: sportradar-simulation:local
    container_name: sportradar-app
    ports:
      - '3000:3000'
    environment:
      NODE_ENV: development
      PORT: 3000
      # Simulation defaults (patrz src/shared/config/.env.example)
      SIMULATION_DURATION_MS: 9000
      GOAL_INTERVAL_MS: 1000
      GOAL_COUNT: 9
      FIRST_GOAL_OFFSET_MS: 1000
      START_COOLDOWN_MS: 5000
      FINISHED_RETENTION_MS: 3600000
      GC_INTERVAL_MS: 300000
    restart: unless-stopped
```

- [ ] **Step 2: Verify compose up works**

Run:
```bash
docker compose up -d --build
sleep 3
docker compose ps
docker compose logs app | tail -20
docker compose down
```

Expected: service `app` shows Up; logs contain `Application is running on port 3000`.

- [ ] **Step 3: Commit Docker files**

```bash
git add Dockerfile .dockerignore docker-compose.yml
git commit -m "chore: multi-stage Dockerfile (non-root) and docker-compose skeleton"
```

---

## Task 11: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    name: Lint, typecheck, test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Format check
        run: npm run format:check

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm run test

      - name: Build
        run: npm run build

  docker-build:
    name: Docker build smoke
    runs-on: ubuntu-latest
    needs: lint-and-test

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: false
          tags: sportradar-simulation:ci
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

- [ ] **Step 2: Commit CI workflow**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow (lint, typecheck, test, build, docker)"
```

---

## Task 12: README with architecture overview

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

````markdown
# SportRadar Simulation

REST + WebSocket API do symulacji meczów piłkarskich.

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

Każda niebanalna decyzja architektoniczna = ADR w `docs/decisions/NNN-<slug>.md`. Patrz [CLAUDE.md](./CLAUDE.md#decision-logging--zasada-złota) dla zasad.

## Project context

Patrz [CLAUDE.md](./CLAUDE.md) — architectural principles, testing philosophy, git workflow.

## License

Private.
````

- [ ] **Step 2: Commit README**

```bash
git add README.md
git commit -m "docs: README with quick start, architecture overview, phased roadmap"
```

---

## Task 13: CHANGELOG with Phase 0 entry

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create `CHANGELOG.md`**

```markdown
# Changelog

Wszystkie znaczące zmiany w projekcie będą dokumentowane tutaj.

Format zgodny z [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Projekt używa [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-04-18

### Added
- Project scaffolding: TypeScript 5.x strict, NestJS 10.x, Zod + nestjs-zod
- Hexagonal folder structure: `simulation/` + `ownership/` + `shared/` bounded contexts
- 12 empty port interfaces (stubs) — wypełnione w Phase 1
- Zod-validated env config (`src/shared/config/`)
- Jest setup + sanity test (path aliasing, ts-jest)
- ESLint + Prettier with strict TypeScript rules
- Multi-stage Dockerfile (non-root user)
- docker-compose skeleton (app only; redis/postgres w późniejszych fazach)
- GitHub Actions CI (format check, lint, typecheck, test, build, docker build)
- README z phased roadmap
- CLAUDE.md z architectural principles + decision logging rules
- Design spec `docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md`

### Tagged
- `v0.1-scaffold`

[Unreleased]: https://example.invalid/compare/v0.1-scaffold...HEAD
[0.1.0]: https://example.invalid/releases/tag/v0.1-scaffold
```

- [ ] **Step 2: Commit CHANGELOG**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG with Phase 0 entry"
```

---

## Task 14: Verify full Phase 0 passes all gates

- [ ] **Step 1: Clean install + run all gates locally**

Run:
```bash
rm -rf node_modules dist coverage
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: each command exits 0.

- [ ] **Step 2: Verify Docker build + run**

Run:
```bash
docker compose build
docker compose up -d
sleep 3
curl -sf -o /dev/null -w '%{http_code}' http://localhost:3000 || true
docker compose logs app | grep 'Application is running'
docker compose down
```

Expected: log line `Application is running on port 3000` appears.

- [ ] **Step 3: Verify clean git status**

Run:
```bash
git status
```

Expected: `nothing to commit, working tree clean`.

---

## Task 15: Git tag v0.1-scaffold

- [ ] **Step 1: Create annotated tag**

```bash
git tag -a v0.1-scaffold -m "Phase 0 — Scaffolding complete

Project skeleton with TypeScript strict, NestJS, Zod config, hexagonal
structure, Jest, Docker multi-stage, GitHub Actions CI. All ports are
empty interface stubs — Phase 1 will fill signatures and add
implementations.

Ready for Phase 1: MVP in-process."
```

- [ ] **Step 2: Verify tag**

Run:
```bash
git tag -l
git show v0.1-scaffold --stat
```

Expected: `v0.1-scaffold` listed, shows tag message + commit summary.

- [ ] **Step 3: Create Phase 0 post-implementation review task**

After this plan completes, run the quality gates from CLAUDE.md §Post-implementation:
1. `simplify` skill — review scaffolding for unnecessary complexity (expected: minimal findings, this phase is intentionally minimal)
2. Security review — focus: Dockerfile (non-root user ✓), secrets management (none yet), GH Actions permissions (default)

Document findings in a short review note in `docs/decisions/001-phase-0-post-review.md` if anything non-trivial surfaces.

---

## Task 16: Quality gate — simplify

**Files:**
- Create (conditional): `docs/decisions/001-phase-0-post-review.md`

- [ ] **Step 1: Invoke simplify skill**

Manual trigger (when executing this plan):
```
Skill: simplify
Target: all Phase 0 files (src/, test/, Dockerfile, ci.yml, configs)
```

Expected output: review notes. Typically Phase 0 has minimal surface so findings should be few.

- [ ] **Step 2: Document any actionable findings**

If simplify identifies 1+ issue worth fixing, create:

```markdown
# ADR-001: Phase 0 simplify review outcome

- **Status**: Accepted
- **Date**: 2026-04-18
- **Phase**: 0

## Context
After Phase 0 implementation, ran `simplify` skill review per CLAUDE.md quality gates.

## Findings
(enumerate)

## Decision
(action taken, inline fixes vs deferred)

## Consequences
(impact)
```

If no findings: skip this task and note in CHANGELOG `Unreleased` → "simplify review: no findings".

---

## Task 17: Quality gate — security review

- [ ] **Step 1: Dispatch feature-dev:code-reviewer agent with security focus**

Scope:
- Dockerfile (non-root user verification, layer leaks)
- .dockerignore completeness
- GitHub Actions permissions (default read-only? any secrets needed later?)
- package.json dependencies (known CVEs via `npm audit`)
- Env handling (ensure `.env` not leaking into build)

Prompt skeleton:
> Review Phase 0 scaffolding for security issues. Focus: Dockerfile (user isolation, minimal attack surface), .dockerignore (no secrets leak), GitHub Actions (principle of least privilege, no secret exposure), npm audit output. Report: any HIGH/CRITICAL findings, and any MEDIUM worth fixing before Phase 1.

- [ ] **Step 2: Run `npm audit`**

Run:
```bash
npm audit --audit-level=moderate
```

Expected: no HIGH/CRITICAL findings. If present, address before tagging (`npm audit fix` lub swap dependencji).

- [ ] **Step 3: Document findings**

Add ADR-002 if actionable findings; skip otherwise with note in CHANGELOG.

---

## Task 18: Final commit + push readiness

- [ ] **Step 1: Ensure all changes committed**

Run:
```bash
git status
git log --oneline
```

Expected: `working tree clean`, log shows scaffold progression (init → configs → bootstrap → docker → ci → docs → tag).

- [ ] **Step 2: Summary for demo**

At end of Phase 0 you should be able to demonstrate:
- `git log --oneline` shows ~8-10 atomic, conventional commits
- `npm test` runs and passes in <2s
- `npm run build` produces clean `dist/`
- `docker compose up` starts application successfully
- GitHub Actions CI passes on push (verify after pushing to origin)

Phase 0 done. Next: create Phase 1 plan (`2026-04-19-phase-1-mvp-in-process.md` or similar date).

---

## Phase 0 — Summary

| # | Task | Deliverable |
|---|---|---|
| 1 | Init npm project + install deps | `package.json` z full scripts + deps |
| 2 | TS strict config | `tsconfig.json` + `tsconfig.build.json` |
| 3 | ESLint + Prettier | `.eslintrc.cjs`, `.prettierrc`, `.prettierignore` |
| 4 | Commit configs | atomic commit |
| 5 | NestJS bootstrap | `src/main.ts` + `src/app.module.ts` |
| 6 | Zod env config | `src/shared/config/*` + `AppConfigModule` |
| 7 | Hexagonal structure + stubs | port files, `.gitkeep`s, path aliases działają |
| 8 | Jest + sanity test | `jest.config.ts` + `test/sanity.spec.ts` pass |
| 9 | Dockerfile | multi-stage, non-root, builds cleanly |
| 10 | docker-compose | app-only skeleton, `compose up` działa |
| 11 | CI workflow | `.github/workflows/ci.yml` (lint + test + docker) |
| 12 | README | quick start + architecture + roadmap |
| 13 | CHANGELOG | Phase 0 entry |
| 14 | Full gate verification | clean install + Docker smoke test |
| 15 | Git tag `v0.1-scaffold` | annotated tag |
| 16 | simplify review | ADR-001 if findings |
| 17 | Security review | ADR-002 if findings + `npm audit` clean |
| 18 | Final verification | green git status, demo readiness |

**Expected duration**: 45-90 min wykonania ręcznego, lub 1 przebieg subagent-driven.
