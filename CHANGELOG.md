# Changelog

Wszystkie znaczące zmiany w projekcie będą dokumentowane tutaj.

Format zgodny z [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Projekt używa [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-04-18

### Added
- Project scaffolding: TypeScript 5.x strict, NestJS 10.x, Zod + nestjs-zod
- Hexagonal folder structure: `simulation/` + `ownership/` + `shared/` bounded contexts
- 12 empty port interfaces (stubs) — wypełnione w Phase 1
- Zod-validated env config (`src/shared/config/`)
- Jest setup + sanity test (path aliasing, ts-jest)
- ESLint + Prettier with strict TypeScript rules (incl. `no-floating-promises`)
- Multi-stage Dockerfile (non-root user)
- docker-compose skeleton (app only; redis/postgres w późniejszych fazach)
- GitHub Actions CI (format check, lint, typecheck, test, build, docker build)
- README z phased roadmap + env vars table
- CLAUDE.md z architectural principles + decision logging rules
- Design spec `docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md`
- Phase 0 implementation plan `docs/superpowers/plans/2026-04-18-phase-0-scaffold.md`

### Notes
- `.env.example` skipped in root (path-guard hook); `config.schema.ts` jest canonical source of truth for env vars
- Code quality review (Task 3) dodał `@typescript-eslint/no-floating-promises` rule i usunął deprecated `interface-name-prefix`

### Tagged
- `v0.1-scaffold`

[Unreleased]: https://example.invalid/compare/v0.1-scaffold...HEAD
[0.1.0]: https://example.invalid/releases/tag/v0.1-scaffold
