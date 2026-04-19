# ADR-008: Drop `RedisSimulationRepository` after Postgres swap

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 4a

## Context
Phase 2 introduced `RedisSimulationRepository` (HSET + JSON serialization) as a stepping-stone — distributed mode without requiring a relational DB. Phase 4a brings PostgreSQL as the production persistence target. The Redis adapter has no remaining production use case.

## Options considered
1. **Keep all 3 impls** (`inmemory|redis|postgres`) — backward compat for env values.
2. **Drop `RedisSimulationRepository`** — `PERSISTENCE_MODE` reduces to `inmemory|postgres`.
3. **Mark as `@deprecated`** — keep file but warn in factory.

## Decision
Option 2 (drop). Redis-as-persistence was a temporary decision (Phase 2 §D2 brainstorm). After Postgres lands, maintaining a third path adds factory branches, tests, and confusion ("which is canonical?") with zero benefit. The Phase 2 demo argument ("same business test passes on Redis too") is preserved via git history — `git checkout v3.0-profile-driven` restores the impl. Redis container itself stays running (BullMQ needs it).

## Consequences
- ✅ One fewer adapter to maintain (factory branches, tests, type imports)
- ✅ `PERSISTENCE_MODE` becomes a binary choice: `inmemory` (dev/test) or `postgres` (prod) — reduces cognitive load
- ✅ Cleaner demo narrative: "Redis = transport layer (BullMQ), Postgres = persistence layer"
- ❌ Breaking change for anyone with `PERSISTENCE_MODE=redis` in their env. Our only deployment is `docker-compose.yml` which we update in the same phase. No external impact.
- 🔄 `test/integration/distributed/redis-simulation.repository.spec.ts` deleted with the impl

## References
- Phase 4a spec: `docs/superpowers/specs/2026-04-19-phase-4a-postgres-persistence-design.md` §3 D4
- Phase 4a plan Task 14
- Phase 2 ADR (D2): unified BullMQ + Redis chosen as Phase 2 stepping-stone
