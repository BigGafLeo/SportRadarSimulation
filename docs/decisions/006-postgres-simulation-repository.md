# ADR-006: Postgres Simulation Repository — full swap (no Redis hot/cold hybrid)

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 4a

## Context
Phase 4a replaces `RedisSimulationRepository` (Phase 2 stepping-stone) with a durable persistence layer. Two shapes considered: (1) full Postgres swap, (2) hybrid Redis-hot + Postgres-cold where Redis stays as working set and Postgres receives only lifecycle events.

## Options considered
1. **Full Postgres swap** — single repository impl, every `save()` writes to PG. Simple model, single source of truth.
2. **Hybrid Redis hot + Postgres cold** — Redis keeps running aggregates, Postgres receives snapshot on `finish()`. Two repos, route by state.
3. **Postgres + write-coalesce** — full PG with batched writes flushed on tick boundaries.

## Decision
Option 1 (full Postgres swap). At demo scale our load is 10-180 writes/s; Postgres 16 handles 5000+ TPS with default config — ~1% utilization. Bottleneck order at real high scale: worker concurrency (4 instances → 100+ first), then WS layer, then BullMQ, only then Postgres. Hybrid would be premature optimization. The `SimulationRepository` port stays open — Phase 6 can introduce `HybridSimulationRepository` as a new adapter behind the same port if metrics ever demand it. Zero refactor needed in domain/application.

## Consequences
- ✅ Single repo impl — simple to reason about, easy to test
- ✅ `docker compose down && up -d` preserves all simulations (no cache rebuild dance)
- ✅ Phase 5 (event sourcing / replay) lands naturally on PG with new tables
- ✅ Port-based design preserves the option of hybrid swap later (just a new adapter, no domain change)
- ❌ Each `applyGoal` is one PG transaction (~2-5ms). For demo this adds <50ms cumulative per match — invisible.
- 🔄 `RedisSimulationRepository` is deleted (see ADR-008)

## References
- Phase 4a spec: `docs/superpowers/specs/2026-04-19-phase-4a-postgres-persistence-design.md` §3 D1
- Phase 4a plan Task 10
