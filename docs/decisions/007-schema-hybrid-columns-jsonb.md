# ADR-007: Simulation table schema — hybrid (queryable columns + JSONB score)

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 4a

## Context
The `simulations` table needs to support: indexed filtering (dashboard polls RUNNING-only sims), per-aggregate fast load (no JOIN-and-rebuild on every `findById`), and forward-compatible schema for Phase 5 rich events.

## Options considered
1. **JSONB blob** — single `snapshot JSONB` column with the full aggregate snapshot. Filter via `WHERE snapshot->>'state' = 'RUNNING'`.
2. **Fully normalized** — every aggregate field as its own column, including `match_scores` in a child table.
3. **Hybrid** — metadata columns for queryable fields (`state`, `owner_token`, `name`, `total_goals`, `started_at`, `finished_at`, `profile_id`) + JSONB `score_snapshot` for the `MatchScoreSnapshot[]` array.

## Decision
Option 3 (hybrid). B-tree indexes on `state` and `owner_token` give millisecond filter responses; JSONB for the per-match score array avoids a JOIN on every `findById` and keeps the schema flexible for Phase 5 (rich events extend snapshot shape with zero migration).

## Consequences
- ✅ `WHERE state = 'RUNNING'` uses index (sub-ms even with 100k rows)
- ✅ Phase 4b ownership refactor: `ALTER TABLE simulations ADD COLUMN owner_id UUID NULL; UPDATE ... SET owner_id = ... FROM users WHERE token = owner_token; ALTER TABLE simulations DROP COLUMN owner_token;` — clean
- ✅ Phase 5 rich events: extend `score_snapshot` JSONB shape (e.g., add `cards`, `injuries`) without migration
- ❌ More repository mapping code than option 1 (each column → snapshot field)
- ❌ `score_snapshot` not indexed — full table scan if you ever want "sims where home team scored ≥5". Acceptable: not a real query pattern.

## References
- Phase 4a spec: `docs/superpowers/specs/2026-04-19-phase-4a-postgres-persistence-design.md` §3 D2, §4
- Phase 4a plan Task 6
