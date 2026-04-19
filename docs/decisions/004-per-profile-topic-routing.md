# ADR-004: Per-profile topic routing — `simulation.run.{profileId}`

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 3

## Context
Phase 3 splits worker pool by profile. Need to route `RunSimulation` commands to the correct worker subset. Three options.

## Options considered
1. **Single `simulation.run` topic + header/payload-based filtering** — all workers consume one queue, drop jobs not matching their profile via `if (cmd.profileId !== this.profileId) requeue()`. Pros: one queue. Cons: every worker reads every job, terrible scaling, requeue loops, broken backpressure.
2. **One topic per profile** (this ADR) — `simulation.run.uniform-realtime`, `simulation.run.poisson-accelerated`, `simulation.run.fast-markov`. Each worker subscribes to exactly one. Native BullMQ partitioning.
3. **Sharded routing via consumer groups** — only available in Kafka, not BullMQ. Out of scope.

## Decision
Option 2. `SIMULATION_TOPICS.RUN(profileId)` already exists in code (`src/simulation/application/commands/simulation-topics.ts`) — just needs to be wired through. Orchestrator dispatches with profileId. Worker reads `SIMULATION_PROFILE` env and subscribes to that one topic.

## Consequences
- ✅ Native BullMQ partitioning — no application-level filtering
- ✅ Per-profile scaling: `docker compose scale worker-poisson=5` adds consumers only to that topic
- ✅ Per-profile metrics: dashboard already shows queue counts per topic
- ❌ N profiles = N queues. Each worker maintains 1 queue connection (cheap).
- ❌ If profile has zero subscribers, jobs pile up (see ADR D8 — Phase 6 readiness gate fixes this)

## References
- Phase 3 plan Tasks 12-14
- Spec §7.1, §7.6
