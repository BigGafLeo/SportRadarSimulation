# ADR-005: AcceleratedClock — real-time timestamps, accelerated scheduling

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 3

## Context
Phase 3 wants to demo a 90-min match compressed to ~9s wall clock. Engine uses `Clock.sleep(ms, signal)` for tick delays. Two concerns are entangled: virtual time (what the dynamics thinks "match time" is) vs real time (event timestamps, audit trail).

## Options considered
1. **Pure virtual clock**: `now()` returns virtual time, `sleep()` divides by factor. Pro: dynamics & event timestamps fully consistent. Con: event timestamps lose audit value (cannot correlate with real wall clock).
2. **Pure real clock with virtual scheduling**: `now()` real, `sleep()` divides by factor. Pro: timestamps audytowalne. Con: dynamics that read `now()` for elapsed-time decisions get inconsistent view (most don't read `now()` directly though).
3. **Two-clock split**: pass `WallClock` and `VirtualClock` separately. Pro: maximally explicit. Con: API surface grows, engine signature changes, propagates through 5 files.

## Decision
Option 2: `AcceleratedClock` returns real time from `now()` and divides `sleep(ms)` by factor. Engine-side timing accelerates; event timestamps stay real-world (`occurredAt: Date`). Dynamics in our codebase don't call `clock.now()` for scheduling decisions (they accumulate `delayMs` from start), so option 2 is sufficient.

## Consequences
- ✅ Zero changes to engine signature or `Clock` port
- ✅ Event timestamps retain audytowalność (replay analytics in Phase 5 reads real wall-clock dates)
- ✅ Composable: `new AcceleratedClock(systemClock, 600)` wraps any `Clock` impl
- ❌ Dynamics that need elapsed-virtual-time would get wrong values from `now()`. Mitigation: dynamics pass tickIndex + their own accumulator (current pattern).
- 🔄 If Phase 5 introduces a dynamics that needs virtual `now()`, revisit with ADR-NNN (likely option 3 split)

## References
- Phase 3 plan Task 4
- Spec §6 Clock port, §9 Phase 3
