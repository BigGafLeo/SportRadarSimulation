# Phase 3 — Profile-Driven Specialization: Test Coverage

**Tag:** `v3.0-profile-driven`
**Total:** 333 tests across 54 suites (0 failures)
**New in Phase 3:** +61 tests / +10 suites vs Phase 2

---

## What's New in Phase 3

Phase 3 introduces **profile-driven simulation specialization**: three named profiles (`uniform-realtime`, `poisson-accelerated`, `fast-markov`), each bundling a dynamics strategy + clock configuration. New dynamics implementations, an accelerated clock, a profile registry, and per-profile BullMQ topic routing.

### New Test Files (57 tests / 10 files)

| File | Tests | Details |
|------|-------|---------|
| `poisson-goal-dynamics.spec.ts` | 9 | Time-exhaustion, valid team IDs, statistical mean validation, constructor guards (duration ≤ 0), rate=0 edge case, abort handling, state cleanup |
| `fast-markov-dynamics.spec.ts` | 11 | GoalScored events, durationMs respect, delayMs=stepMs, state cleanup, constructor guards (stepMs ≤ 0), durationMs=0, stepMs > duration, abort no-op/idempotent, determinism |
| `team-picker.spec.ts` | 3 | Returns PRESET_TEAMS member, fixed-seed determinism, all-6-teams distribution |
| `accelerated-clock.spec.ts` | 6 | Real now(), sleep(1000) at factor=10 ≈ 100ms, abort via signal, factor ≤ 0 throws, factor=1 real-time, sleep(0) immediate |
| `profile-registry.spec.ts` | 11 | 3 profiles exposed, DEFAULT_PROFILE_ID, getProfile lookup, unknown throws, each profile produces working dynamics+clock, SystemClock for uniform-realtime, empty/null/undefined throws, PROFILES frozen, config enum in sync |
| `config.schema.spec.ts` | 3 | SIMULATION_PROFILE defaults to uniform-realtime, accepts known profiles, rejects unknown |
| `create-simulation.request.spec.ts` | 3 | Default profile, known profiles, unknown rejected |
| `shutdown-util.spec.ts` | 6 | null/undefined/no-method/non-function no-op, calls shutdown() + resolves, error propagation |
| `per-profile-routing.spec.ts` | 2 | Topic isolation (uniform-realtime ≠ poisson-accelerated), same-profile load balancing — **real Redis via Testcontainers** |
| `profile-param.e2e-spec.ts` | 3 | POST without profile defaults, each known profile accepted, unknown → 400 |

### Enhanced Existing Files (+4 tests)

| File | Change | New Tests |
|------|--------|-----------|
| `seeded-random-provider.spec.ts` | 6 → 8 | `float()` range [0, 1), float() determinism |
| `crypto-random-provider.spec.ts` | 5 → 7 | `float()` range [0, 1), float() value variety |

---

## Full Inventory by Layer

### Domain Layer (117 tests / 12 files)

Unchanged from Phase 2.

### Application Layer (20 tests / 2 files)

Unchanged from Phase 2.

### Infrastructure Layer (154 tests / 29 files)

Phase 2 infrastructure (105) + new dynamics/profiles/clock (+49):

| Area | Component | Tests | Status |
|------|-----------|-------|--------|
| Dynamics | UniformRandomGoalDynamics | 8 | Unchanged |
| Dynamics | PoissonGoalDynamics | 9 | **NEW** |
| Dynamics | FastMarkovDynamics | 11 | **NEW** |
| Dynamics | teamPicker | 3 | **NEW** |
| Time | AcceleratedClock | 6 | **NEW** |
| Time | SystemClock | 5 | Unchanged |
| Time | FakeClock | 7 | Unchanged |
| Profiles | ProfileRegistry | 11 | **NEW** |
| Random | CryptoRandomProvider | 7 | +2 (float) |
| Random | SeededRandomProvider | 8 | +2 (float) |
| All others | — | — | Unchanged from Phase 2 |

### Shared (9 tests / 2 files)

| Component | Tests | Status |
|-----------|-------|--------|
| ConfigSchema | 3 | **NEW** — SIMULATION_PROFILE validation |
| shutdownIfPossible | 6 | **NEW** — graceful shutdown utility |

### Integration — In-Process (14 tests / 5 files)

Unchanged from Phase 2.

### Integration — Distributed (13 tests / 5 files)

Phase 2 distributed (11 tests) + per-profile routing (2):

| File | Tests | Status |
|------|-------|--------|
| `per-profile-routing.spec.ts` | 2 | **NEW** — topic isolation + load balancing |
| All others | — | Unchanged from Phase 2 |

### E2E (5 tests / 3 files)

Phase 2 E2E (2) + profile-param (3):

| File | Tests | Status |
|------|-------|--------|
| `profile-param.e2e-spec.ts` | 3 | **NEW** — default/known/unknown profile via HTTP |
| ws-goal-observer, ws-multi-observer | 2 | Unchanged |

### Sanity (2 tests / 1 file)

Unchanged.

---

## Bugs Discovered During Test Hardening

Two potential **infinite loop** bugs found and fixed:

1. **FastMarkovDynamics** — `stepMs=0` causes `while(elapsedMs + 0 <= durationMs)` to never advance. Fix: constructor guard throws on `stepMs ≤ 0`.

2. **PoissonGoalDynamics** — `durationMs=0` causes `totalRatePerMs = Infinity`, sampling loop never terminates. Fix: constructor guard throws on `durationMs ≤ 0`.

Both are guarded with constructor validation and tested.

---

## Testing Strategy

New dynamics are tested with **deterministic seeded providers** — same seed produces same goal sequence, enabling exact assertions without statistical flakiness. Statistical tests (Poisson mean validation) run over many samples with wide tolerance.

Profile registry tests verify the **full vertical slice**: registry → dynamics factory → clock factory → working pair. This catches wiring errors early without needing integration tests for each profile combination.

Per-profile topic routing uses real Redis (Testcontainers) to validate that BullMQ topic isolation actually works at the queue level.
