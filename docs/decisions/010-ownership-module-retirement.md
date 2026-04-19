# ADR-010: Ownership Module Retirement

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 4b
- **Supersedes**: Ownership module (Phase 1)

## Context
Phase 1 introduced `src/ownership/` as a stepping stone for anonymous token-based ownership. Phase 4b introduces real auth with JWT + user accounts. The ownership module is now redundant.

## Options considered
1. **Refactor in-place** — Rename OwnershipToken to userId, keep module structure.
2. **Delete and replace** — Remove entire `src/ownership/`, build new `src/auth/` from scratch.

## Decision
Option 2. The code is fundamentally different — OwnershipToken is a random UUID generator with in-memory storage; auth is JWT + Passport + User aggregate + Prisma. Refactoring would be more confusing than a clean swap.

Stepping stone lifecycle: Phase 1 created it → Phase 4b retires it. Like RedisSimulationRepository in Phase 2→4a.

## Consequences
- ✅ Clean codebase — no dead code or legacy abstractions
- ✅ ADR documents the lifecycle for interview discussion
- ❌ Tests referencing OwnershipToken must be rewritten
- 🔄 ThrottlePolicy parameter changes from OwnershipToken to string (userId)
- 🔄 SimulationRepository.findByOwner changes from OwnershipToken to string
- 🔄 Simulation aggregate: ownerToken → ownerId (string)

## References
- ADR-009: Auth Architecture
- Phase 4b implementation plan
