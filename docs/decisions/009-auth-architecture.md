# ADR-009: Auth Architecture — JWT + Passport with Loose Coupling

- **Status**: Accepted
- **Date**: 2026-04-19
- **Phase**: 4b

## Context
Phase 4b replaces anonymous OwnershipToken with real user accounts. Need auth that is testable, swappable for external IdP, and does not couple SimulationModule to auth internals.

## Options considered
1. **Tight coupling** — SimulationModule imports auth guards directly. Simple but hard to swap.
2. **Loose coupling via shared contract** — SimulationModule sees only `AuthenticatedUser` interface + guard token. Auth module provides the implementation.
3. **Auth as separate microservice** — Full extraction. Over-engineering for monolith demo.

## Decision
Option 2 — loose coupling. SimulationModule depends on `AuthenticatedUser { id, email }` interface and `AUTH_GUARD` symbol. JWT strategy, Passport, User aggregate — all hidden inside `src/auth/`.

No refresh tokens — stateless JWT with 15min TTL. Refresh adds complexity without security value when there's no server-side revocation. Documented as Phase 5+ if needed.

## Consequences
- ✅ Swap to Keycloak/Auth0 = new guard, zero simulation changes (~1-2h)
- ✅ B→C (microservice) extraction cost: new NestJS app + proxy routing
- ✅ Tests use FakePasswordHasher (plaintext, no argon2 overhead)
- ❌ No token revocation — acceptable for recruitment demo
- 🔄 SimulationController changes from `@Headers('x-simulation-token')` to `@UseGuards() @CurrentUser()`

## References
- Phase 4b implementation plan
- ADR-010: Ownership Module Retirement
