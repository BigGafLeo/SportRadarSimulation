# Phase 1 — MVP In-Process: Test Coverage

**Tag:** `v1.0-mvp-in-process`
**Total:** 245 tests across 31 files (0 failures)

---

## Domain Layer (92 tests / 11 files)

### Value Objects (65 tests / 8 files)

| File | Tests | Scenarios |
|------|-------|-----------|
| `simulation-name.spec.ts` | 20 | Valid ASCII/Polish, boundary 8 & 30 chars, too short/long, special chars (emoji, hyphen), whitespace-only, zero-width chars, leading/trailing whitespace, tabs, newlines |
| `score-board.spec.ts` | 13 | Init 0:0, increment, totalGoals, multi-increment same team, reset, fromSnapshot, unknown matchId error, immutability |
| `simulation-id.spec.ts` | 7 | Valid UUID v4, non-UUID, empty, whitespace, uppercase UUID, equality, toString |
| `team-id.spec.ts` | 7 | Non-empty creation, single char, empty/whitespace rejection, equality, toString |
| `match.spec.ts` | 6 | Create with teams, same-team rejection, teams(), equals(), toJSON |
| `matches-preset.spec.ts` | 5 | 3 matches, correct team pairs, PRESET_TEAMS has 6 teams |
| `match-id.spec.ts` | 4 | Non-empty string, empty/whitespace rejection, equality |
| `team.spec.ts` | 3 | Creation, empty displayName rejection, id-based equality |

### Aggregate — Simulation (21 tests / 1 file)

| Scenario Group | Tests | Details |
|----------------|-------|---------|
| Creation | 2 | RUNNING state, 0:0 scoreboard, SimulationStarted event |
| Goal application | 3 | Score increment, totalGoals, GoalScored event, error when FINISHED |
| Finish | 4 | RUNNING->FINISHED, manual/auto reason, event with final scores, error when already FINISHED |
| Restart | 3 | FINISHED->RUNNING, score reset, SimulationRestarted event, error when RUNNING |
| Snapshot | 4 | toSnapshot/fromSnapshot round-trip, restored state mutations, null finishedAt |
| Multi-cycle | 3 | Restart->finish cycles with score reset, post-restart goals, event ordering |
| Event ordering | 2 | Create->Goal->Finish sequence, accumulated events in order |

### Errors (23 tests / 1 file)

| Class | Tests | Details |
|-------|-------|---------|
| DomainError (base) | 5 | instanceof Error/DomainError, message, name = concrete class, stack trace |
| InvalidStateError | 12 | instanceof chain, message format "Cannot X in state Y", currentState/attemptedAction, RUNNING/FINISHED states |
| InvalidValueError | 6 | instanceof chain, message format, field/reason/rawValue, generic rawValue types (string, number, object) |

### Events (7 tests / 1 file)

All 4 event types tested: SimulationStarted, GoalScored, SimulationFinished, SimulationRestarted — structure, type property, data preservation.

---

## Application Layer (22 tests / 2 files)

### Orchestrator (18 tests)

| Use Case | Tests | Details |
|----------|-------|---------|
| startSimulation | 3 | Creation with userId, returns state+snapshot, dispatches RunCommand |
| finishSimulation | 3 | Dispatches AbortCommand, OwnershipMismatchError, SimulationNotFoundError |
| restartSimulation | 3 | Restart for owner, OwnershipMismatchError, InvalidStateError (RUNNING) |
| listSimulations | 2 | Returns all snapshots, empty array |
| getSimulation | 2 | Returns by id, unknown id error |
| Throttling | 5 | Blocks within cooldown, allows different users, allows after cooldown, timing boundaries |

### Worker/Handler (4 tests)

Runs engine to completion (9 goals + auto-finish), abort mid-run, abort unknown id (silent no-op), shutdown aborts in-flight.

---

## Infrastructure Layer (131 tests / 18 files)

### Time (12 tests / 2 files)

| Component | Tests | Details |
|-----------|-------|---------|
| SystemClock | 5 | Wall-clock accuracy, sleep(0), sleep(30ms), abort pre/mid-wait |
| FakeClock | 7 | Deterministic now(), advance(), sleep resolution on advance, multi-sleep ordering, abort |

### Random (15 tests / 2 files)

| Component | Tests | Details |
|-----------|-------|---------|
| CryptoRandomProvider | 7 | int() inclusive range, min==max, uuid() format+uniqueness, float() range+variety |
| SeededRandomProvider | 8 | Determinism, int() ranges+negative, uuid() determinism+format, float() range |

### Engine (5 tests / 1 file)

Full event loop: 9 goals + auto-finish, GoalScored with incrementing totalGoals, abort mid-run (no finish event), pre-aborted signal, goalCount=0.

### Dynamics (11 tests / 2 files)

| Component | Tests | Details |
|-----------|-------|---------|
| UniformRandomGoalDynamics | 8 | tick timing, goal completion, team from PRESET_TEAMS, determinism, distribution, goalCount=0/1 |
| teamPicker | 3 | Returns PRESET_TEAMS member, determinism, all-6-teams distribution |

### Persistence (12 tests / 1 file)

InMemorySimulationRepository: findById (null/found), save (overwrite/persist), delete (remove/idempotent), findAll, findByOwner, findLastStartedAtByOwner (null/latest/scoped).

### Policies (13 tests / 2 files)

| Component | Tests | Details |
|-----------|-------|---------|
| FiveSecondCooldown | 7 | null lastIgnitionAt, exact 5s boundary, blocks within, custom cooldown, cooldownMs=0 |
| TtlRetention | 6 | RUNNING never removed, younger/older than TTL, exact boundary, ttlMs=0 |

### Consumer — HTTP (15 tests / 3 files)

| Component | Tests | Details |
|-----------|-------|---------|
| SimulationController | 5 | POST create, POST finish, POST restart, GET list, GET by id |
| DomainExceptionFilter | 7 | InvalidValue->400, InvalidState->409, NotFound->404, Ownership->403, Throttled->429, unknown rethrown |
| CreateSimulationRequest | 3 | Default profile, known profiles, unknown rejected |

### Consumer — WebSocket (6 tests / 1 file)

handleSubscribe (join room, bad UUID), handleUnsubscribe (leave, bad UUID), WsEventForwarder (broadcast to room, isolation, start/stop).

### Messaging (17 tests / 3 files)

| Component | Tests | Details |
|-----------|-------|---------|
| InMemoryCommandBus | 7 | Dispatch, multiple subscribers, unsubscribe, no-op unsubscribed, error propagation, topic isolation |
| InMemoryEventBus | 8 | Publish, filter true/false, multi-subscriber, filter by simulationId, error propagation, unsubscribe, empty meta |
| InMemoryEventPublisher | 2 | Publishes with auto-metadata, error propagation |

---

## Integration (1 test / 1 file)

**simulation-engine-end-to-end.spec.ts**: Full in-process lifecycle — 9-goal simulation to completion (<100ms via FakeClock), engine->repo->bus integration, final state persisted.

---

## What's NOT Tested (and Why)

| Category | Files | Reason |
|----------|-------|--------|
| Port interfaces | 10 files (clock, random, engine, etc.) | TypeScript interfaces — no runtime behavior to test |
| Event classes | 5 files (GoalScored, etc.) | Simple data carriers — tested via domain-events.spec.ts and aggregate tests |
| Error classes | 3 files (DomainError, etc.) | Tested via domain-errors.spec.ts |
| Command DTOs | 3 files (RunCommand, AbortCommand, topics) | Pure data — tested via orchestrator/worker that use them |
| NestJS module | simulation.module.ts | DI wiring — tested through integration and E2E |
| Response DTOs | simulation-response.dto.ts | Zod transform — tested via controller spec |
| CoreSimulationConfig | Interface only | TypeScript interface |
| WsEventForwarder | Tested via gateway.spec.ts | Not isolated, but fully exercised through gateway |
| SimulationRepositoryFactory | Phase 4 addition | Factory tested in Phase 4 |
