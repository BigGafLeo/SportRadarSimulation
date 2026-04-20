# Phase 1 — MVP In-Process: Test Coverage

**Tag:** `v1.0-mvp-in-process`
**Total:** 248 tests across 39 suites (0 failures)

---

## Domain Layer (114 tests / 12 files)

### Aggregate — Simulation (17 tests / 1 file)

| Scenario Group | Tests | Details |
|----------------|-------|---------|
| Creation | 3 | RUNNING state, 0:0 scoreboard, SimulationStarted event, pullEvents clears buffer |
| Goal application | 3 | Score increment + totalGoals, GoalScored event, error when FINISHED |
| Finish | 4 | RUNNING→FINISHED, manual/auto reason, event with final scores, error when already FINISHED |
| Restart | 3 | FINISHED→RUNNING, score + totalGoals reset, SimulationRestarted event, error when RUNNING |
| Multi-cycle | 2 | Score resets on each restart, goals work after restart |
| Event ordering | 2 | Create→Goal→Finish sequence, accumulated events in insertion order |

### Value Objects (65 tests / 8 files)

| File | Tests | Scenarios |
|------|-------|-----------|
| `simulation-name.spec.ts` | 20 | Valid ASCII/Polish, boundary 8 & 30 chars, too short/long, special chars (emoji, hyphen), whitespace-only, zero-width chars, leading/trailing whitespace, tabs, newlines |
| `score-board.spec.ts` | 10 | Init 0:0, increment home/away, unknown team error, totalGoals, reset, multi-increment accumulation, snapshot structure |
| `simulation-id.spec.ts` | 7 | Valid UUID v4, non-UUID, empty, whitespace, uppercase UUID, equality, toString |
| `team-id.spec.ts` | 7 | Non-empty creation, single char, empty/whitespace rejection, equality, toString |
| `match.spec.ts` | 6 | Create with teams, same-team rejection, teams(), equals(), toJSON |
| `matches-preset.spec.ts` | 5 | 3 matches, correct team pairs (GER–POL, BRA–MEX, ARG–URU), PRESET_TEAMS 6 teams |
| `ownership-token.spec.ts` | 5 | UUID v4 creation, non-UUID rejection, empty rejection, equality, toString |
| `match-id.spec.ts` | 4 | Non-empty string, empty/whitespace rejection, equality |
| `team.spec.ts` | 3 | Creation, empty displayName rejection, id-based equality |

### Errors (23 tests / 1 file)

| Class | Tests | Details |
|-------|-------|---------|
| DomainError (base) | 5 | instanceof Error/DomainError, message, name = concrete class, stack trace |
| InvalidStateError | 12 | instanceof chain, message format "Cannot X in state Y", currentState/attemptedAction, RUNNING/FINISHED states |
| InvalidValueError | 6 | instanceof chain, message format, field/reason/rawValue, generic rawValue types (string, number, object) |

### Events (7 tests / 1 file)

All 4 event types tested: SimulationStarted, GoalScored, SimulationFinished, SimulationRestarted — structure, type property, data preservation.

---

## Application Layer (20 tests / 2 files)

### Orchestrator (16 tests)

| Use Case | Tests | Details |
|----------|-------|---------|
| startSimulation | 7 | Creation with new/existing ownershipToken, unknown token error, throttle, CommandBus dispatch, EventBus publish, lastIgnitionAt update |
| finishSimulation | 3 | Dispatches AbortCommand, OwnershipMismatchError, SimulationNotFoundError |
| restartSimulation | 2 | Restart for owner, throttle on restart |
| listSimulations + getSimulation | 4 | Returns all snapshots, empty array, returns by id, unknown id error |

### Worker/Handler (4 tests)

Runs engine to completion (9 goals + auto-finish), abort mid-run, abort unknown id (silent no-op), shutdown aborts in-flight.

---

## Infrastructure Layer (96 tests / 17 files)

### Time (12 tests / 2 files)

| Component | Tests | Details |
|-----------|-------|---------|
| SystemClock | 5 | Wall-clock accuracy, sleep(0), sleep(30ms), abort pre/mid-wait |
| FakeClock | 7 | Deterministic now(), advance(), sleep resolution on advance, multi-sleep ordering, abort, advance(0) no-op |

### Random (11 tests / 2 files)

| Component | Tests | Details |
|-----------|-------|---------|
| CryptoRandomProvider | 5 | int() inclusive range, min==max, uuid() format+uniqueness |
| SeededRandomProvider | 6 | Determinism, int() ranges, min==max, uuid() determinism+format |

### Engine (5 tests / 1 file)

Full event loop: 9 goals + auto-finish, GoalScored with incrementing totalGoals, abort mid-run (no finish emitted), pre-aborted signal, goalCount=0.

### Dynamics (8 tests / 1 file)

UniformRandomGoalDynamics: tick timing (firstGoalOffset + goalInterval), goal completion, team from PRESET_TEAMS, determinism, distribution across 6 teams, goalCount=0/1 boundary.

### Persistence (16 tests / 3 files)

| Component | Tests | Details |
|-----------|-------|---------|
| InMemorySimulationRepository | 9 | findById (null/found), save (overwrite/persist), findAll, findByOwner (match/no-match), delete (remove/idempotent), empty repo |
| InMemoryOwnershipRepository | 4 | findByToken (null/found), save+find round-trip, updateLastIgnitionAt, unknown token error |
| UuidOwnershipTokenGenerator | 3 | UUID v4 wrapping, uniqueness, deterministic with SeededRandom |

### Policies (13 tests / 2 files)

| Component | Tests | Details |
|-----------|-------|---------|
| FiveSecondCooldown | 7 | null lastIgnitionAt, exact 5s boundary, blocks within, custom cooldown, cooldownMs=0, same-timestamp blocked |
| TtlRetention | 6 | RUNNING never removed, younger/older than TTL, exact boundary, ttlMs=0 |

### Messaging (11 tests / 3 files)

| Component | Tests | Details |
|-----------|-------|---------|
| InMemoryCommandBus | 5 | Dispatch, multiple subscribers, unsubscribe, no-op unsubscribed, topic isolation |
| InMemoryEventBus | 5 | Publish, filter true/false, multi-subscriber, filter by simulationId, unsubscribe |
| InMemoryEventPublisher | 1 | Publishes with auto-metadata |

### Consumer — HTTP (14 tests / 2 files)

| Component | Tests | Details |
|-----------|-------|---------|
| SimulationController | 6 | POST create (with/without token), POST finish (token required), POST restart (token required), GET list, GET by id |
| DomainExceptionFilter | 8 | InvalidValue→400, InvalidState→409, NotFound→404, OwnershipMismatch→403, Throttled→429, UnknownToken→401, unknown rethrown, response body structure |

### Consumer — WebSocket (6 tests / 1 file)

handleSubscribe (join room, bad UUID), handleUnsubscribe (leave, bad UUID), WsEventForwarder (broadcast to room, room isolation).

---

## Integration (14 tests / 5 files)

| File | Tests | Details |
|------|-------|---------|
| `simulation-engine-end-to-end.spec.ts` | 1 | Full 9-goal simulation in <100ms via FakeClock — engine→repo→bus integration |
| `http-lifecycle.e2e-spec.ts` | 3 | POST creates 201 + ownershipToken, full flow (start→9 goals→auto-finish), GET lists |
| `http-manual-finish.e2e-spec.ts` | 4 | Manual finish mid-sim, no token→401, unknown token→401, unknown sim→404 |
| `http-restart.e2e-spec.ts` | 2 | Restart after auto-finish (score reset), restart when RUNNING→409 |
| `http-throttle-validation.e2e-spec.ts` | 4 | Same token 5s→429, name too short→400, special chars→400, name too long→400 |

---

## E2E (2 tests / 2 files)

| File | Tests | Details |
|------|-------|---------|
| `ws-goal-observer.e2e-spec.ts` | 1 | Subscribe + receive 9 goal-scored events + simulation-finished |
| `ws-multi-observer.e2e-spec.ts` | 1 | Two observers on same simulation both receive 9 goals |

---

## Sanity (2 tests / 1 file)

Jest wiring + path alias import.
