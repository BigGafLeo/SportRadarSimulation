# Phase 3 — Profile-Driven Specialization: Test Coverage

**Tag:** `v3.0-profile-driven`
**Phase-specific tests:** 60 tests across 8 files
**Cumulative total:** 318 tests (Phase 1: 245 + Phase 2: 13 + Phase 3: 60)

---

## Dynamics (33 tests / 4 files)

### Fast Markov Dynamics (13 tests)

**File:** `test/unit/infrastructure/dynamics/fast-markov-dynamics.spec.ts`

| Scenario Group | Tests | Details |
|----------------|-------|---------|
| Happy path | 4 | Emits GoalScored, valid team IDs, respects durationMs, delayMs = stepMs |
| Constructor guards | 2 | stepMs=0 throws, stepMs negative throws |
| Edge cases | 3 | durationMs=0 returns undefined, stepMs > durationMs, state cleanup |
| Abort handling | 2 | Unknown ID no-op, multiple aborts idempotent |
| Determinism | 2 | Same seed -> same sequence, different seeds -> different |

### Poisson Goal Dynamics (9 tests)

**File:** `test/unit/infrastructure/dynamics/poisson-goal-dynamics.spec.ts`

| Scenario Group | Tests | Details |
|----------------|-------|---------|
| Happy path | 2 | Returns undefined when time exhausted, valid team IDs |
| Statistical validation | 1 | Average goals near expected mean over many runs |
| Constructor guards | 2 | durationMs=0 throws, durationMs negative throws |
| Edge cases | 1 | goalsPerTeamMean=0 returns undefined immediately |
| Abort handling | 2 | Unknown ID no-op, idempotent |
| State cleanup | 1 | No memory leak after match end |

### Uniform Random Goal Dynamics (8 tests)

**File:** `test/unit/infrastructure/dynamics/uniform-random-goal-dynamics.spec.ts`

(Phase 1 baseline, listed here for completeness)

| Scenario | Details |
|----------|---------|
| Tick timing | tickIndex=0 -> firstGoalOffsetMs, tickIndex>0 -> goalIntervalMs |
| Completion | undefined at goalCount |
| Event shape | GoalScored with PRESET_TEAMS member |
| Determinism | Fixed seed -> same team sequence |
| Distribution | All 6 PRESET_TEAMS covered |
| Edge cases | goalCount=0 and goalCount=1 |

### Team Picker (3 tests)

**File:** `test/unit/infrastructure/dynamics/team-picker.spec.ts`

| Scenario | Details |
|----------|---------|
| Happy path | Returns PRESET_TEAMS member |
| Determinism | Fixed seed -> same team |
| Distribution | All 6 teams covered over 600 samples |

---

## Time (18 tests / 3 files)

### Accelerated Clock (6 tests)

**File:** `test/unit/infrastructure/time/accelerated-clock.spec.ts`

| Scenario | Details |
|----------|---------|
| now() | Returns real wall-clock (no acceleration on now) |
| Acceleration | sleep(1000) at factor=10 finishes in ~100ms |
| Abort | AbortSignal cancels sleep |
| Validation | factor <= 0 throws |
| No acceleration | factor=1 matches real sleep duration |
| Zero sleep | sleep(0) resolves immediately |

### System Clock & Fake Clock (12 tests)

(Phase 1 components, included in Phase 3 for full profile testing support)

---

## Profile Registry (9 tests / 1 file)

**File:** `test/unit/infrastructure/profiles/profile-registry.spec.ts`

| Scenario | Details |
|----------|---------|
| Registry contents | 3 profiles: uniform-realtime, poisson-accelerated, fast-markov |
| Default | DEFAULT_PROFILE_ID = uniform-realtime |
| Lookup | getProfile returns matching profile |
| Unknown profile | getProfile throws on unknown ID |
| Factory integration | Each profile produces working dynamics + clock |
| Clock type | uniform-realtime uses SystemClock |
| Error handling | Empty string, null, undefined all throw |
| Immutability | PROFILES object is frozen |
| Sync check | Config schema profile enum matches registry keys |

---

## Bug Fixes Discovered During Test Hardening

Two potential **infinite loop** bugs were found and fixed:

1. **FastMarkovDynamics** — `stepMs=0` causes `while(elapsedMs + 0 <= durationMs)` to never advance. **Fix:** constructor guard throws on `stepMs <= 0`.

2. **PoissonGoalDynamics** — `durationMs=0` causes `totalRatePerMs = Infinity`, then `sampleExp = 0`, and the sampling loop never terminates. **Fix:** constructor guard throws on `durationMs <= 0`.

Both are now guarded with constructor validation and tested.

---

## What's NOT Tested (and Why)

| Category | Files | Reason |
|----------|-------|--------|
| Dynamics source implementations | 4 .ts files | Fully tested by their corresponding .spec.ts files |
| Profile type definitions | Types only | No runtime behavior |
| Bull Board topic registration | Runtime wiring | Integration concern — tested via E2E with docker-compose |
| AcceleratedClock precision | Sub-ms timing | OS-dependent jitter makes sub-ms assertions flaky; tested at 100ms granularity |
