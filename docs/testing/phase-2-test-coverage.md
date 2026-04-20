# Phase 2 — BullMQ Distributed: Test Coverage

**Tag:** `v2.0-bullmq-distributed`
**Phase-specific tests:** 13 tests across 4 files
**Cumulative total:** 258 tests (Phase 1: 245 + Phase 2: 13)

---

## Unit Tests (6 tests / 1 file)

### Shutdown Utility (6 tests)

**File:** `test/unit/shared/messaging/shutdown-util.spec.ts`

| Scenario | Details |
|----------|---------|
| null input | No-op, no throw |
| undefined input | No-op, no throw |
| Object without shutdown method | No-op, no throw |
| Non-function shutdown property | No-op, no throw |
| Successful shutdown | Calls async shutdown(), awaits completion |
| Shutdown throws | Error propagates to caller |

---

## Integration Tests (7 tests / 3 files)

All integration tests use **Testcontainers** with real Redis — no mocks.

### BullMQ Command Bus (3 tests)

**File:** `test/integration/distributed/bullmq-command-bus.spec.ts`

| Scenario | Details |
|----------|---------|
| Dispatch delivery | Command arrives at subscribed handler |
| Topic routing | Different topics route to different handlers |
| Unsubscribe | Stops delivery after unsubscription |

### BullMQ Event Bus (2 tests)

**File:** `test/integration/distributed/bullmq-event-bus.spec.ts`

| Scenario | Details |
|----------|---------|
| Event delivery | Subscriber receives published event |
| Filter function | Filter skips unwanted events |

### Per-Profile Routing (2 tests)

**File:** `test/integration/distributed/per-profile-routing.spec.ts`

| Scenario | Details |
|----------|---------|
| Topic isolation | Worker on "uniform-realtime" does NOT receive "poisson-accelerated" job |
| Load balancing | Two workers on same profile share load |

---

## What's NOT Tested (and Why)

| Category | Files | Reason |
|----------|-------|--------|
| Port interfaces | command-bus.port.ts, event-bus.port.ts | TypeScript interfaces |
| In-memory messaging implementations | in-memory-command-bus.ts, in-memory-event-bus.ts, in-memory-event-publisher.ts | Tested in Phase 1 as infrastructure components — same code, Phase 2 promotes to shared/ |
| BullMQ adapters (unit level) | bullmq-command-bus.ts, bullmq-event-bus.ts | Integration-tested with real Redis; unit tests would require extensive mocking of BullMQ internals with little added value |
| Docker entrypoints | worker.main.ts, APP_MODE switching | E2E-level concern — docker-compose integration tested manually |
| Bull Board UI | /admin/queues route | Third-party UI, tested manually via browser |

---

## Testing Strategy

Phase 2 introduces distributed messaging. The testing approach favors **real-infrastructure integration tests** over unit tests with mocked BullMQ, because:

1. BullMQ behavior (job serialization, topic routing, worker acknowledgment) is the value under test
2. Mocking the queue would test our mock, not the integration
3. Testcontainers provide reliable, reproducible Redis instances in CI
4. Integration tests catch real issues (serialization, connection handling, topic naming)
