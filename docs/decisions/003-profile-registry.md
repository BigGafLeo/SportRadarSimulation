# ADR-003: Profile registry — single const map shared by orchestrator and worker

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 3

## Context
Phase 3 introduces multiple `(MatchDynamics, Clock, config)` combinations as named profiles. Two sides need access to the registry: orchestrator (Zod whitelist for `POST /simulations { profile }`) and worker (DI override based on `SIMULATION_PROFILE` env). Three options for storing this registry.

## Options considered
1. **DB-backed registry** — Postgres table `profiles { id, dynamicsClass, clockClass, config }`. Pros: dynamic, can add profiles at runtime. Cons: massive overkill, requires DB before Phase 4, profiles are code (factories), can't really live in DB.
2. **Env-defined registry** — `PROFILES_JSON='[{"id":"poisson","dynamics":"PoissonGoalDynamics",...}]'`. Pros: ops-tunable. Cons: env can't reference TS classes, requires reflection / DI string lookup, fragile.
3. **Const map in code** — `export const PROFILES: Record<string, Profile>` in `src/simulation/infrastructure/profiles/profile-registry.ts`. Pros: type-safe, factories are TS functions, both modules import same source of truth. Cons: adding a profile requires code change + redeploy.

## Decision
Option 3. Profiles are inherently code (factories with class references) — DB/env can't represent them. Compile-time registry. Adding a profile = new file + entry in registry + redeploy. Worker reads env to pick which one. Orchestrator reads `Object.keys(PROFILES)` for Zod whitelist.

## Consequences
- ✅ Type-safe end-to-end (Zod enum literally references `PROFILE_IDS` array)
- ✅ Both sides pull from same source — impossible to drift
- ✅ Profile factories can capture local config (tunable per profile in code)
- ❌ Adding profile = code change + redeploy. Acceptable for our cadence.
- 🔄 If Phase 6+ wants ops-pluggable profiles, can swap to file-based loading at startup with same `PROFILES` shape.

## References
- Phase 3 plan Tasks 9-11
- Spec §3.6, §7.6
