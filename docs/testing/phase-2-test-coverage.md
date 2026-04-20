# Phase 2 — BullMQ Distributed: Test Coverage

**Tag:** `v2.0-bullmq-distributed`
**Total:** 272 tests across 44 suites (0 failures)
**New in Phase 2:** +24 tests / +5 suites vs Phase 1

---

## What's New in Phase 2

Phase 2 introduces distributed messaging via BullMQ + Redis. The testing strategy favors **real-infrastructure integration tests** (Testcontainers with real Redis) over unit tests with mocked BullMQ, because the actual queue behavior (serialization, topic routing, worker acknowledgment) is the value under test.

### New Test Files (13 tests / 5 files)

| File | Tests | Details |
|------|-------|---------|
| `redis.client.spec.ts` | 2 | ioredis instance creation, lazyConnect deferred connection |
| `redis-simulation.repository.spec.ts` | 5 | findById null/found, save+find round-trip, findAll, findByOwner, delete — **real Redis via Testcontainers** |
| `bullmq-command-bus.spec.ts` | 3 | Dispatch delivery, topic routing, unsubscribe — **real Redis via Testcontainers** |
| `bullmq-event-bus.spec.ts` | 2 | Event delivery, filter function — **real Redis via Testcontainers** |
| `http-distributed.e2e-spec.ts` | 1 | Full flow over BullMQ: POST → 9 goals → auto-finish with real engine timing — **real Redis via Testcontainers** |

### Enhanced Existing Files (+11 tests)

| File | Change | New Tests |
|------|--------|-----------|
| `score-board.spec.ts` | 10 → 12 | `fromSnapshot` reconstruction, unknown matchId error |
| `simulation.spec.ts` | 17 → 20 | `fromSnapshot` round-trip (RUNNING), round-trip after goals+finish, restored aggregate mutation |
| `in-memory-event-publisher.spec.ts` | 1 → 2 | Error propagation from underlying EventBus |
| `in-memory-command-bus.spec.ts` | 5 → 7 | Error propagation from handler, idempotent multiple unsubscribe |
| `in-memory-event-bus.spec.ts` | 5 → 8 | Handler error propagation, filter error propagation, empty meta delivery |

---

## Full Inventory by Layer

### Domain Layer (117 tests / 12 files)

Same as Phase 1 plus `fromSnapshot` tests:
- Simulation aggregate: **20 tests** (+3: fromSnapshot round-trips + mutation after restore)
- ScoreBoard: **12 tests** (+2: fromSnapshot reconstruction + unknown matchId)
- All other domain files unchanged from Phase 1

### Application Layer (20 tests / 2 files)

Unchanged from Phase 1.

### Infrastructure Layer (105 tests / 19 files)

Phase 1 infrastructure (96 tests) + enhanced messaging (99) + new distributed components (6):

| Component | Tests | Change |
|-----------|-------|--------|
| InMemoryCommandBus | 7 | +2 (error propagation, idempotent unsub) |
| InMemoryEventBus | 8 | +3 (handler error, filter error, empty meta) |
| InMemoryEventPublisher | 2 | +1 (error propagation) |
| createRedisClient | 2 | **NEW** — ioredis creation + lazyConnect |
| All others | — | Unchanged from Phase 1 |

### Integration — In-Process (14 tests / 5 files)

Unchanged from Phase 1.

### Integration — Distributed (11 tests / 4 files)

All use **Testcontainers** with real Redis — no mocks.

| File | Tests | Details |
|------|-------|---------|
| `redis-simulation.repository.spec.ts` | 5 | Full CRUD: findById, save, findAll, findByOwner, delete |
| `bullmq-command-bus.spec.ts` | 3 | Dispatch, topic routing, unsubscribe |
| `bullmq-event-bus.spec.ts` | 2 | Event delivery, filter function |
| `http-distributed.e2e-spec.ts` | 1 | Full POST→9 goals→auto-finish flow over BullMQ (real timing ~11s) |

### E2E + Sanity (4 tests / 3 files)

Unchanged from Phase 1 (2 WebSocket tests + 2 sanity).

---

## Testing Strategy

Phase 2's distributed tests validate the **actual BullMQ ↔ Redis integration**:

1. Job serialization/deserialization through real queues
2. Topic-based routing between workers
3. Connection lifecycle (lazyConnect, cleanup)
4. Full HTTP→BullMQ→Engine→Redis pipeline in one integration test

Unit-testing BullMQ adapters would require mocking internal queue behavior — testing the mock, not the integration. Testcontainers provide reproducible Redis instances in CI with the same guarantees as production.
