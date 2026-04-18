# ADR-001: MatchDynamics.nextStep.event is an intent, not the final emitted event

- **Status**: Accepted
- **Date**: 2026-04-18
- **Phase**: 1b

## Context

Phase 1a defined `MatchDynamics.nextStep(simulation, tickIndex): Promise<TimedEvent | undefined>` where `TimedEvent = { delayMs, event: DomainEvent }`. However, `DomainEvent` (specifically `GoalScored`) requires post-state fields (score snapshot, totalGoals, occurredAt) which Dynamics cannot know without mutating the aggregate — a responsibility we want to keep in the aggregate itself.

## Options considered

1. **Dynamics applies goals to aggregate** — simple but violates separation: Dynamics becomes a side-effect owner, not just a strategy.
2. **Port signature change** — redefine port to return `{ delayMs, intent: IntentDescriptor }`. Cleaner semantically but breaks Phase 1a port already committed and pushed.
3. **Dynamics returns intent events, Engine applies** — keep port as-is, interpret `event` as "what would happen", Engine dispatches on `event.type` to the appropriate aggregate method. Placeholder fields on intent are ignored.

## Decision

Option 3. `MatchDynamics` produces `TimedEvent` where `event` carries only the fields necessary to dispatch (e.g., `teamId` for `GoalScored`). Engine discriminates on `event.type`, calls the matching aggregate method, and emits the aggregate's real events via the `emit` callback.

## Consequences

- ✅ `MatchDynamics` remains pure (no aggregate mutation, no Clock dependency)
- ✅ Aggregate retains sole authority over invariants and final event construction
- ✅ Phase 1a port signature preserved — no rewrite needed
- ❌ Engine has a small switch on event type (currently one case: `GoalScored`). Phase 3 rich events add more cases.
- ❌ Intent events carry placeholder values for ignored fields — not elegant but localized to Dynamics implementations
- 🔄 Phase 3 (RichEventDynamics) must document the same pattern for new event types

## References

- Port definition: `src/simulation/domain/ports/match-dynamics.port.ts`
- First implementation: `src/simulation/infrastructure/dynamics/uniform-random-goal-dynamics.ts`
- Engine dispatch: `src/simulation/infrastructure/engine/ticking-simulation-engine.ts`
- Design spec §6.3 (original port definition)
