# ADR-002: SimulationConfig split into core + per-dynamics configs

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 3

## Context
Phase 1/2 `SimulationConfig` mixes domain timing (`durationMs`) with uniform-random-specific fields (`goalCount`, `goalIntervalMs`, `firstGoalOffsetMs`) and orchestrator policy params (`startCooldownMs`). Phase 3 adds Poisson and Markov dynamics, each with own config shape (`goalsPerTeamMean`, `stepMs` etc.). Single shared interface forces unrelated fields together and grows monotonically.

## Options considered
1. **Discriminated union per profile** — `type SimulationConfig = UniformConfig | PoissonConfig | MarkovConfig`. Pros: type-safe per profile. Cons: every consumer needs narrowing; orchestrator would have to know profile types.
2. **Nested per-dynamics config** — `SimulationConfig { core, uniform?, poisson?, markov? }`. Pros: single object. Cons: optional fields, runtime checks for "is the right one populated".
3. **Split into independent interfaces** (this ADR) — `CoreSimulationConfig` separate from `UniformDynamicsConfig` / `PoissonDynamicsConfig` / `MarkovDynamicsConfig`. Each dynamics holds its own config. Orchestrator takes `cooldownMs` as primitive (no config object).

## Decision
Option 3. Each `MatchDynamics` impl encapsulates its own config interface. `CoreSimulationConfig` holds only `durationMs` (advisory total match duration, used by Poisson for λ and Markov for max steps). Orchestrator drops `SimulationConfig` dep entirely — uses `cooldownMs: number` primitive injected from env.

## Consequences
- ✅ Each dynamics fully owns its config — adding new dynamics = adding new config interface, zero ripple
- ✅ Orchestrator decoupled from dynamics-specific timing (single responsibility)
- ✅ Profile registry holds `(coreConfig, dynamicsConfig)` per profile — composable
- ❌ `SimulationConfig` interface deleted — breaking change for any external consumer (none in this repo)
- 🔄 `simulation.module.ts` and `worker.module.ts` factories simplified (no more `configFromEnv` helper)

## References
- Phase 3 plan: `docs/superpowers/plans/2026-04-19-phase-3-profile-driven-specialization.md` Task 2
- Spec §6, §9 Phase 3
