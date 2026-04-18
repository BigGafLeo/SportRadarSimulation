# Phase 1a — Domain Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wypełnić warstwę domain projektu SportRadar: Value Objects (9 VO z walidacją Zod), Domain Events (4 event types), Domain Errors, aggregate `Simulation` z state machine + invariants, oraz sygnatury wszystkich 10 portów. Delivery state: wszystkie unit testy domain zielone, `npm test` pokazuje nowe test suites, lint/typecheck/build clean. **Nie** ma jeszcze infrastructure adapters (Phase 1b) ani REST/WS (Phase 1c) ani tagu (tag `v1.0-mvp-in-process` dopiero po 1c).

**Architecture:** Pure TS w `src/<context>/domain/`, zero importów z `@nestjs/*` lub `zod` poza VO (VO mogą importować Zod dla walidacji — decision §D7 ze speca). Agregat `Simulation` hermetyzuje stan + invariants, emituje domain events. Porty są tylko interfejsami (impl w 1b). Testy unit lokalizowane pod `test/unit/domain/`, używają path aliasów `@simulation/*`, `@ownership/*`.

**Tech Stack:** TypeScript 5.x strict, Zod 3.x (VO validation), Jest + ts-jest (unit tests), `crypto.randomUUID()` (w testach — produkcyjnie przez port `OwnershipTokenGenerator` w 1b).

**Spec reference:** `docs/superpowers/specs/2026-04-18-sportradar-simulation-design.md` §5 (Domain Model), §6 (Ports catalog).

**Decisions applied:**
- D3: ignition event = Start ∨ Restart
- D7: Simulation jako DDD Aggregate
- D8: Zod everywhere (w VO factory methods)
- D10: Unicode letters `\p{L}` w SimulationName
- D11: no trim, reject leading/trailing whitespace
- D13: uniform 1/6 team selection (implementation w 1b, ale interface MatchDynamics.nextStep podpisujemy teraz)

---

## Naming conventions (applied consistently across all tasks)

- VO factory: `SimulationName.create(raw: string): SimulationName` — throws `InvalidValueError` on failure (używamy `throw` zamiast `Result<T>` dla prostoty; wrapper w application layer złapie w exception filter → HTTP 400)
- Immutability: wszystkie VO mają `readonly` properties; `class` z prywatnym konstruktorem + statyczną fabryką
- Equality: VO mają metodę `equals(other): boolean` bazującą na `value`
- Serialization: VO mają `toString()` / `toJSON()` żeby łatwo było logować i serializować do odpowiedzi HTTP

## File structure (Phase 1a creates/modifies)

```
src/simulation/domain/
├── value-objects/
│   ├── simulation-id.ts              (new)
│   ├── simulation-name.ts            (new — Zod regex + refine)
│   ├── team-id.ts                    (new)
│   ├── match-id.ts                   (new)
│   ├── team.ts                       (new)
│   ├── match.ts                      (new)
│   ├── matches-preset.ts             (new — 3 hardcoded matches per PDF)
│   └── score-board.ts                (new)
├── events/
│   ├── domain-event.ts               (new — base type + helper)
│   ├── simulation-started.ts         (new)
│   ├── goal-scored.ts                (new)
│   ├── simulation-finished.ts        (new)
│   └── simulation-restarted.ts       (new)
├── errors/
│   ├── domain.error.ts               (new — base class)
│   ├── invalid-state.error.ts        (new)
│   └── invalid-value.error.ts        (new)
├── aggregates/
│   └── simulation.ts                 (new — state machine + invariants)
└── ports/                            (modified — fill signatures)
    ├── clock.port.ts
    ├── random-provider.port.ts
    ├── simulation-repository.port.ts
    ├── event-publisher.port.ts
    ├── simulation-engine.port.ts
    ├── match-dynamics.port.ts
    ├── retention-policy.port.ts
    └── throttle-policy.port.ts

src/ownership/domain/
├── value-objects/
│   └── ownership-token.ts            (new)
└── ports/                            (modified — fill signatures)
    ├── ownership-repository.port.ts
    └── ownership-token-generator.port.ts

src/shared/messaging/                 (modified — fill signatures)
├── command-bus.port.ts
└── event-bus.port.ts

test/unit/domain/
├── value-objects/
│   ├── simulation-id.spec.ts         (new)
│   ├── simulation-name.spec.ts       (new)
│   ├── team-id.spec.ts               (new)
│   ├── match-id.spec.ts              (new)
│   ├── team.spec.ts                  (new)
│   ├── match.spec.ts                 (new)
│   ├── matches-preset.spec.ts        (new)
│   ├── score-board.spec.ts           (new)
│   └── ownership-token.spec.ts       (new)
├── events/
│   └── domain-events.spec.ts         (new — snapshot structural tests)
└── aggregates/
    └── simulation.spec.ts            (new — state machine + invariants)
```

Nowe pliki `*.gitkeep` można usunąć z folderów w które dodawane są pliki (np. `src/simulation/domain/value-objects/.gitkeep` → delete gdy pierwszy VO wchodzi).

---

## Task 1: TeamId + MatchId Value Objects

**Files:**
- Create: `src/simulation/domain/value-objects/team-id.ts`
- Create: `src/simulation/domain/value-objects/match-id.ts`
- Create: `src/simulation/domain/errors/domain.error.ts`
- Create: `src/simulation/domain/errors/invalid-value.error.ts`
- Create: `test/unit/domain/value-objects/team-id.spec.ts`
- Create: `test/unit/domain/value-objects/match-id.spec.ts`
- Delete: `src/simulation/domain/value-objects/.gitkeep` (no longer needed)
- Delete: `src/shared/errors/.gitkeep` → not touched here, errors go to `src/simulation/domain/errors/`

- [ ] **Step 1: Write failing test for TeamId**

Create `test/unit/domain/value-objects/team-id.spec.ts`:
```typescript
import { TeamId } from '@simulation/domain/value-objects/team-id';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('TeamId', () => {
  it('creates from non-empty string', () => {
    const id = TeamId.create('germany');
    expect(id.value).toBe('germany');
  });

  it('rejects empty string', () => {
    expect(() => TeamId.create('')).toThrow(InvalidValueError);
  });

  it('rejects whitespace-only string', () => {
    expect(() => TeamId.create('   ')).toThrow(InvalidValueError);
  });

  it('equality compares by value', () => {
    expect(TeamId.create('germany').equals(TeamId.create('germany'))).toBe(true);
    expect(TeamId.create('germany').equals(TeamId.create('poland'))).toBe(false);
  });

  it('toString returns value', () => {
    expect(TeamId.create('germany').toString()).toBe('germany');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
npm test -- team-id.spec
```
Expected: fails — module `@simulation/domain/value-objects/team-id` not found.

- [ ] **Step 3: Create error base classes**

`src/simulation/domain/errors/domain.error.ts`:
```typescript
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
```

`src/simulation/domain/errors/invalid-value.error.ts`:
```typescript
import { DomainError } from './domain.error';

export class InvalidValueError extends DomainError {
  constructor(
    public readonly field: string,
    public readonly reason: string,
    public readonly rawValue?: unknown,
  ) {
    super(`Invalid value for ${field}: ${reason}`);
  }
}
```

- [ ] **Step 4: Implement TeamId**

`src/simulation/domain/value-objects/team-id.ts`:
```typescript
import { z } from 'zod';
import { InvalidValueError } from '../errors/invalid-value.error';

const TeamIdSchema = z.string().min(1).refine((s) => s.trim().length > 0, 'whitespace-only');

export class TeamId {
  private constructor(public readonly value: string) {}

  static create(raw: string): TeamId {
    const parsed = TeamIdSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidValueError('TeamId', parsed.error.issues[0]?.message ?? 'invalid', raw);
    }
    return new TeamId(parsed.data);
  }

  equals(other: TeamId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
```

- [ ] **Step 5: Run the test, verify it passes**

```bash
npm test -- team-id.spec
```
Expected: PASS, 5 tests.

- [ ] **Step 6: Mirror pattern for MatchId**

`test/unit/domain/value-objects/match-id.spec.ts`:
```typescript
import { MatchId } from '@simulation/domain/value-objects/match-id';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('MatchId', () => {
  it('creates from non-empty string', () => {
    expect(MatchId.create('germany-vs-poland').value).toBe('germany-vs-poland');
  });

  it('rejects empty', () => {
    expect(() => MatchId.create('')).toThrow(InvalidValueError);
  });

  it('equality by value', () => {
    expect(MatchId.create('m1').equals(MatchId.create('m1'))).toBe(true);
  });
});
```

`src/simulation/domain/value-objects/match-id.ts`:
```typescript
import { z } from 'zod';
import { InvalidValueError } from '../errors/invalid-value.error';

const MatchIdSchema = z.string().min(1).refine((s) => s.trim().length > 0, 'whitespace-only');

export class MatchId {
  private constructor(public readonly value: string) {}

  static create(raw: string): MatchId {
    const parsed = MatchIdSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidValueError('MatchId', parsed.error.issues[0]?.message ?? 'invalid', raw);
    }
    return new MatchId(parsed.data);
  }

  equals(other: MatchId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
```

- [ ] **Step 7: Verify all tests + lint + typecheck pass, then commit**

```bash
npm test && npm run lint && npx tsc --noEmit
rm src/simulation/domain/value-objects/.gitkeep
git add src/simulation/domain/value-objects/team-id.ts src/simulation/domain/value-objects/match-id.ts src/simulation/domain/errors/ test/unit/domain/value-objects/team-id.spec.ts test/unit/domain/value-objects/match-id.spec.ts
git add -u src/simulation/domain/value-objects/.gitkeep
git commit -m "feat(domain): TeamId + MatchId value objects with Zod validation

- TeamId, MatchId: non-empty string wrappers, equals by value
- DomainError base + InvalidValueError for VO validation failures
- 8 unit tests total (5 TeamId + 3 MatchId)"
```

---

## Task 2: Team + Match VOs + PRESET_MATCHES

**Files:**
- Create: `src/simulation/domain/value-objects/team.ts`
- Create: `src/simulation/domain/value-objects/match.ts`
- Create: `src/simulation/domain/value-objects/matches-preset.ts`
- Create: `test/unit/domain/value-objects/team.spec.ts`
- Create: `test/unit/domain/value-objects/match.spec.ts`
- Create: `test/unit/domain/value-objects/matches-preset.spec.ts`

- [ ] **Step 1: Write failing tests**

`test/unit/domain/value-objects/team.spec.ts`:
```typescript
import { Team } from '@simulation/domain/value-objects/team';
import { TeamId } from '@simulation/domain/value-objects/team-id';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('Team', () => {
  it('creates with id and displayName', () => {
    const t = Team.create(TeamId.create('germany'), 'Germany');
    expect(t.id.value).toBe('germany');
    expect(t.displayName).toBe('Germany');
  });

  it('rejects empty displayName', () => {
    expect(() => Team.create(TeamId.create('germany'), '')).toThrow(InvalidValueError);
  });

  it('equality by id only', () => {
    const a = Team.create(TeamId.create('germany'), 'Germany');
    const b = Team.create(TeamId.create('germany'), 'Deutschland');
    expect(a.equals(b)).toBe(true);
  });
});
```

`test/unit/domain/value-objects/match.spec.ts`:
```typescript
import { Match } from '@simulation/domain/value-objects/match';
import { MatchId } from '@simulation/domain/value-objects/match-id';
import { Team } from '@simulation/domain/value-objects/team';
import { TeamId } from '@simulation/domain/value-objects/team-id';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('Match', () => {
  const teamA = Team.create(TeamId.create('germany'), 'Germany');
  const teamB = Team.create(TeamId.create('poland'), 'Poland');

  it('creates with id, home, away', () => {
    const m = Match.create(MatchId.create('m1'), teamA, teamB);
    expect(m.id.value).toBe('m1');
    expect(m.home.id.value).toBe('germany');
    expect(m.away.id.value).toBe('poland');
  });

  it('rejects same team playing itself', () => {
    expect(() => Match.create(MatchId.create('m1'), teamA, teamA)).toThrow(InvalidValueError);
  });

  it('teams() returns both teams', () => {
    const m = Match.create(MatchId.create('m1'), teamA, teamB);
    expect(m.teams().map((t) => t.id.value)).toEqual(['germany', 'poland']);
  });
});
```

`test/unit/domain/value-objects/matches-preset.spec.ts`:
```typescript
import { PRESET_MATCHES, PRESET_TEAMS } from '@simulation/domain/value-objects/matches-preset';

describe('PRESET_MATCHES', () => {
  it('has exactly 3 matches per PDF requirement', () => {
    expect(PRESET_MATCHES).toHaveLength(3);
  });

  it('has Germany vs Poland', () => {
    const m = PRESET_MATCHES[0];
    expect(m.home.displayName).toBe('Germany');
    expect(m.away.displayName).toBe('Poland');
  });

  it('has Brazil vs Mexico', () => {
    const m = PRESET_MATCHES[1];
    expect(m.home.displayName).toBe('Brazil');
    expect(m.away.displayName).toBe('Mexico');
  });

  it('has Argentina vs Uruguay', () => {
    const m = PRESET_MATCHES[2];
    expect(m.home.displayName).toBe('Argentina');
    expect(m.away.displayName).toBe('Uruguay');
  });

  it('PRESET_TEAMS flattens all 6 teams from 3 matches', () => {
    expect(PRESET_TEAMS).toHaveLength(6);
    expect(PRESET_TEAMS.map((t) => t.id.value)).toEqual([
      'germany',
      'poland',
      'brazil',
      'mexico',
      'argentina',
      'uruguay',
    ]);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- team.spec match.spec matches-preset.spec
```
Expected: 3 test suites fail — modules not found.

- [ ] **Step 3: Implement Team**

`src/simulation/domain/value-objects/team.ts`:
```typescript
import { z } from 'zod';
import { TeamId } from './team-id';
import { InvalidValueError } from '../errors/invalid-value.error';

const DisplayNameSchema = z.string().min(1).refine((s) => s.trim().length > 0, 'whitespace-only');

export class Team {
  private constructor(
    public readonly id: TeamId,
    public readonly displayName: string,
  ) {}

  static create(id: TeamId, displayName: string): Team {
    const parsed = DisplayNameSchema.safeParse(displayName);
    if (!parsed.success) {
      throw new InvalidValueError('Team.displayName', parsed.error.issues[0]?.message ?? 'invalid', displayName);
    }
    return new Team(id, parsed.data);
  }

  equals(other: Team): boolean {
    return this.id.equals(other.id);
  }

  toJSON(): { id: string; displayName: string } {
    return { id: this.id.value, displayName: this.displayName };
  }
}
```

- [ ] **Step 4: Implement Match**

`src/simulation/domain/value-objects/match.ts`:
```typescript
import { MatchId } from './match-id';
import { Team } from './team';
import { InvalidValueError } from '../errors/invalid-value.error';

export class Match {
  private constructor(
    public readonly id: MatchId,
    public readonly home: Team,
    public readonly away: Team,
  ) {}

  static create(id: MatchId, home: Team, away: Team): Match {
    if (home.id.equals(away.id)) {
      throw new InvalidValueError('Match', 'home and away teams must differ', { home: home.id.value, away: away.id.value });
    }
    return new Match(id, home, away);
  }

  teams(): readonly [Team, Team] {
    return [this.home, this.away];
  }

  equals(other: Match): boolean {
    return this.id.equals(other.id);
  }

  toJSON(): { id: string; home: ReturnType<Team['toJSON']>; away: ReturnType<Team['toJSON']> } {
    return { id: this.id.value, home: this.home.toJSON(), away: this.away.toJSON() };
  }
}
```

- [ ] **Step 5: Implement PRESET_MATCHES**

`src/simulation/domain/value-objects/matches-preset.ts`:
```typescript
import { MatchId } from './match-id';
import { TeamId } from './team-id';
import { Team } from './team';
import { Match } from './match';

// PDF requirement: 3 fixed matches
const germany = Team.create(TeamId.create('germany'), 'Germany');
const poland = Team.create(TeamId.create('poland'), 'Poland');
const brazil = Team.create(TeamId.create('brazil'), 'Brazil');
const mexico = Team.create(TeamId.create('mexico'), 'Mexico');
const argentina = Team.create(TeamId.create('argentina'), 'Argentina');
const uruguay = Team.create(TeamId.create('uruguay'), 'Uruguay');

export const PRESET_MATCHES: readonly Match[] = [
  Match.create(MatchId.create('germany-vs-poland'), germany, poland),
  Match.create(MatchId.create('brazil-vs-mexico'), brazil, mexico),
  Match.create(MatchId.create('argentina-vs-uruguay'), argentina, uruguay),
] as const;

export const PRESET_TEAMS: readonly Team[] = PRESET_MATCHES.flatMap((m) => [m.home, m.away]);
```

- [ ] **Step 6: Run tests, verify all pass**

```bash
npm test -- team.spec match.spec matches-preset.spec
```
Expected: 3 suites PASS, 10 tests total.

- [ ] **Step 7: Commit**

```bash
git add src/simulation/domain/value-objects/team.ts src/simulation/domain/value-objects/match.ts src/simulation/domain/value-objects/matches-preset.ts test/unit/domain/value-objects/team.spec.ts test/unit/domain/value-objects/match.spec.ts test/unit/domain/value-objects/matches-preset.spec.ts
git commit -m "feat(domain): Team + Match VOs + PRESET_MATCHES (3 fixed matches per PDF)

- Team: id + displayName, equality by id
- Match: home vs away with distinct-teams invariant
- PRESET_MATCHES: Germany/Poland, Brazil/Mexico, Argentina/Uruguay
- PRESET_TEAMS: flattened 6-team list for random selection"
```

---

## Task 3: SimulationId VO

**Files:**
- Create: `src/simulation/domain/value-objects/simulation-id.ts`
- Create: `test/unit/domain/value-objects/simulation-id.spec.ts`

- [ ] **Step 1: Failing test**

`test/unit/domain/value-objects/simulation-id.spec.ts`:
```typescript
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('SimulationId', () => {
  it('creates from UUID v4 string', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(SimulationId.create(uuid).value).toBe(uuid);
  });

  it('rejects non-UUID string', () => {
    expect(() => SimulationId.create('not-a-uuid')).toThrow(InvalidValueError);
  });

  it('rejects empty string', () => {
    expect(() => SimulationId.create('')).toThrow(InvalidValueError);
  });

  it('equality by value', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(SimulationId.create(uuid).equals(SimulationId.create(uuid))).toBe(true);
  });

  it('toString returns value', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(SimulationId.create(uuid).toString()).toBe(uuid);
  });
});
```

- [ ] **Step 2: Implement**

`src/simulation/domain/value-objects/simulation-id.ts`:
```typescript
import { z } from 'zod';
import { InvalidValueError } from '../errors/invalid-value.error';

const SimulationIdSchema = z.string().uuid();

export class SimulationId {
  private constructor(public readonly value: string) {}

  static create(raw: string): SimulationId {
    const parsed = SimulationIdSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidValueError('SimulationId', 'must be UUID v4', raw);
    }
    return new SimulationId(parsed.data);
  }

  equals(other: SimulationId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- simulation-id.spec
git add src/simulation/domain/value-objects/simulation-id.ts test/unit/domain/value-objects/simulation-id.spec.ts
git commit -m "feat(domain): SimulationId VO (UUID v4 wrapper)"
```

---

## Task 4: SimulationName VO (Zod regex + refinement)

**Files:**
- Create: `src/simulation/domain/value-objects/simulation-name.ts`
- Create: `test/unit/domain/value-objects/simulation-name.spec.ts`

Decisions applied: D10 (Unicode letters + digits + space), D11 (no trim, reject leading/trailing whitespace).

- [ ] **Step 1: Failing tests**

`test/unit/domain/value-objects/simulation-name.spec.ts`:
```typescript
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('SimulationName', () => {
  describe('accepts', () => {
    it('ASCII letters + digits + spaces 8-30 chars', () => {
      expect(SimulationName.create('Katar 2023').value).toBe('Katar 2023');
    });

    it('Polish diacritics', () => {
      expect(SimulationName.create('Paryż 2024').value).toBe('Paryż 2024');
    });

    it('exactly 8 characters', () => {
      expect(SimulationName.create('12345678').value).toBe('12345678');
    });

    it('exactly 30 characters', () => {
      const name = 'A'.repeat(30);
      expect(SimulationName.create(name).value).toBe(name);
    });
  });

  describe('rejects', () => {
    it('shorter than 8 chars', () => {
      expect(() => SimulationName.create('Katar23')).toThrow(InvalidValueError);
    });

    it('longer than 30 chars', () => {
      expect(() => SimulationName.create('A'.repeat(31))).toThrow(InvalidValueError);
    });

    it('special characters (hyphen)', () => {
      expect(() => SimulationName.create('Katar-2023')).toThrow(InvalidValueError);
    });

    it('special characters (emoji)', () => {
      expect(() => SimulationName.create('Katar 2023 ⚽')).toThrow(InvalidValueError);
    });

    it('leading whitespace', () => {
      expect(() => SimulationName.create(' Katar 2023')).toThrow(InvalidValueError);
    });

    it('trailing whitespace', () => {
      expect(() => SimulationName.create('Katar 2023 ')).toThrow(InvalidValueError);
    });

    it('tab character', () => {
      expect(() => SimulationName.create('Katar\t2023')).toThrow(InvalidValueError);
    });

    it('newline', () => {
      expect(() => SimulationName.create('Katar\n2023')).toThrow(InvalidValueError);
    });
  });

  it('equality by value', () => {
    expect(SimulationName.create('Katar 2023').equals(SimulationName.create('Katar 2023'))).toBe(true);
  });

  it('toString returns value', () => {
    expect(SimulationName.create('Katar 2023').toString()).toBe('Katar 2023');
  });
});
```

- [ ] **Step 2: Implement**

`src/simulation/domain/value-objects/simulation-name.ts`:
```typescript
import { z } from 'zod';
import { InvalidValueError } from '../errors/invalid-value.error';

// D10: Unicode letters + digits + ASCII space only (no tab, newline, non-breaking space)
const NAME_PATTERN = /^[\p{L}\p{N} ]{8,30}$/u;

export const SimulationNameSchema = z
  .string()
  .regex(NAME_PATTERN, 'must be 8-30 unicode letters/digits/spaces')
  .refine((s) => s === s.trimStart() && s === s.trimEnd(), 'leading/trailing whitespace not allowed');

export class SimulationName {
  private constructor(public readonly value: string) {}

  static create(raw: string): SimulationName {
    const parsed = SimulationNameSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidValueError(
        'SimulationName',
        parsed.error.issues[0]?.message ?? 'invalid',
        raw,
      );
    }
    return new SimulationName(parsed.data);
  }

  equals(other: SimulationName): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- simulation-name.spec
```
Expected: 14 tests pass (4 accepts + 8 rejects + 2 misc).

```bash
git add src/simulation/domain/value-objects/simulation-name.ts test/unit/domain/value-objects/simulation-name.spec.ts
git commit -m "feat(domain): SimulationName VO with Zod Unicode regex

- Accepts 8-30 chars of \p{L}\p{N} or ASCII space (D10)
- Rejects leading/trailing whitespace without trimming (D11)
- 14 tests covering accept/reject edge cases"
```

---

## Task 5: ScoreBoard VO

**Files:**
- Create: `src/simulation/domain/value-objects/score-board.ts`
- Create: `test/unit/domain/value-objects/score-board.spec.ts`

ScoreBoard tracks score per match (home goals + away goals). Immutable operations return new instances.

- [ ] **Step 1: Failing tests**

`test/unit/domain/value-objects/score-board.spec.ts`:
```typescript
import { ScoreBoard } from '@simulation/domain/value-objects/score-board';
import { MatchId } from '@simulation/domain/value-objects/match-id';
import { TeamId } from '@simulation/domain/value-objects/team-id';
import { Team } from '@simulation/domain/value-objects/team';
import { Match } from '@simulation/domain/value-objects/match';

describe('ScoreBoard', () => {
  const germany = Team.create(TeamId.create('germany'), 'Germany');
  const poland = Team.create(TeamId.create('poland'), 'Poland');
  const m1 = Match.create(MatchId.create('m1'), germany, poland);

  it('initializes to 0:0 per match', () => {
    const sb = ScoreBoard.fromMatches([m1]);
    const snapshot = sb.snapshot();
    expect(snapshot).toEqual([{ matchId: 'm1', home: 0, away: 0 }]);
  });

  it('increment returns new ScoreBoard with team goal added', () => {
    const sb = ScoreBoard.fromMatches([m1]);
    const after = sb.increment(TeamId.create('germany'));
    expect(after.snapshot()).toEqual([{ matchId: 'm1', home: 1, away: 0 }]);
    // original unchanged (immutability)
    expect(sb.snapshot()).toEqual([{ matchId: 'm1', home: 0, away: 0 }]);
  });

  it('increment for away team', () => {
    const sb = ScoreBoard.fromMatches([m1]);
    const after = sb.increment(TeamId.create('poland'));
    expect(after.snapshot()).toEqual([{ matchId: 'm1', home: 0, away: 1 }]);
  });

  it('increment for team not in any match throws', () => {
    const sb = ScoreBoard.fromMatches([m1]);
    expect(() => sb.increment(TeamId.create('brazil'))).toThrow();
  });

  it('totalGoals counts across all matches', () => {
    const sb = ScoreBoard.fromMatches([m1]);
    const after = sb.increment(TeamId.create('germany')).increment(TeamId.create('poland')).increment(TeamId.create('germany'));
    expect(after.totalGoals()).toBe(3);
  });

  it('reset returns new ScoreBoard with 0:0 for all matches', () => {
    const sb = ScoreBoard.fromMatches([m1]).increment(TeamId.create('germany'));
    const reset = sb.reset();
    expect(reset.snapshot()).toEqual([{ matchId: 'm1', home: 0, away: 0 }]);
    expect(reset.totalGoals()).toBe(0);
  });
});
```

- [ ] **Step 2: Implement**

`src/simulation/domain/value-objects/score-board.ts`:
```typescript
import { Match } from './match';
import { MatchId } from './match-id';
import { TeamId } from './team-id';
import { InvalidValueError } from '../errors/invalid-value.error';

export interface MatchScoreSnapshot {
  readonly matchId: string;
  readonly home: number;
  readonly away: number;
}

interface MatchScore {
  readonly match: Match;
  readonly home: number;
  readonly away: number;
}

export class ScoreBoard {
  private constructor(private readonly scores: readonly MatchScore[]) {}

  static fromMatches(matches: readonly Match[]): ScoreBoard {
    return new ScoreBoard(matches.map((match) => ({ match, home: 0, away: 0 })));
  }

  increment(teamId: TeamId): ScoreBoard {
    const updated = this.scores.map((entry) => {
      if (entry.match.home.id.equals(teamId)) {
        return { ...entry, home: entry.home + 1 };
      }
      if (entry.match.away.id.equals(teamId)) {
        return { ...entry, away: entry.away + 1 };
      }
      return entry;
    });
    if (updated.every((entry, i) => entry === this.scores[i])) {
      throw new InvalidValueError('ScoreBoard.increment', 'team not in any match', teamId.value);
    }
    return new ScoreBoard(updated);
  }

  totalGoals(): number {
    return this.scores.reduce((sum, entry) => sum + entry.home + entry.away, 0);
  }

  reset(): ScoreBoard {
    return new ScoreBoard(this.scores.map((entry) => ({ ...entry, home: 0, away: 0 })));
  }

  snapshot(): MatchScoreSnapshot[] {
    return this.scores.map((entry) => ({
      matchId: entry.match.id.value,
      home: entry.home,
      away: entry.away,
    }));
  }

  matches(): readonly Match[] {
    return this.scores.map((entry) => entry.match);
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- score-board.spec
```
Expected: 6 tests pass.

```bash
git add src/simulation/domain/value-objects/score-board.ts test/unit/domain/value-objects/score-board.spec.ts
git commit -m "feat(domain): ScoreBoard VO with immutable increment/reset/snapshot

- fromMatches: init 0:0 per match
- increment(teamId): returns new ScoreBoard with +1 for matching team
  (throws if team not in any match)
- totalGoals, reset, snapshot, matches() accessors"
```

---

## Task 6: OwnershipToken VO

**Files:**
- Create: `src/ownership/domain/value-objects/ownership-token.ts`
- Create: `test/unit/domain/value-objects/ownership-token.spec.ts`

- [ ] **Step 1: Failing tests**

`test/unit/domain/value-objects/ownership-token.spec.ts`:
```typescript
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

describe('OwnershipToken', () => {
  it('creates from UUID v4', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(OwnershipToken.create(uuid).value).toBe(uuid);
  });

  it('rejects non-UUID', () => {
    expect(() => OwnershipToken.create('not-a-uuid')).toThrow(InvalidValueError);
  });

  it('rejects empty', () => {
    expect(() => OwnershipToken.create('')).toThrow(InvalidValueError);
  });

  it('equality by value', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(OwnershipToken.create(uuid).equals(OwnershipToken.create(uuid))).toBe(true);
  });

  it('toString returns value', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(OwnershipToken.create(uuid).toString()).toBe(uuid);
  });
});
```

- [ ] **Step 2: Implement**

`src/ownership/domain/value-objects/ownership-token.ts`:
```typescript
import { z } from 'zod';
import { InvalidValueError } from '@simulation/domain/errors/invalid-value.error';

const OwnershipTokenSchema = z.string().uuid();

export class OwnershipToken {
  private constructor(public readonly value: string) {}

  static create(raw: string): OwnershipToken {
    const parsed = OwnershipTokenSchema.safeParse(raw);
    if (!parsed.success) {
      throw new InvalidValueError('OwnershipToken', 'must be UUID v4', raw);
    }
    return new OwnershipToken(parsed.data);
  }

  equals(other: OwnershipToken): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npm test -- ownership-token.spec
git add src/ownership/domain/value-objects/ownership-token.ts test/unit/domain/value-objects/ownership-token.spec.ts
git commit -m "feat(domain): OwnershipToken VO (UUID v4 wrapper, ownership context)"
```

---

## Task 7: Domain Events

**Files:**
- Create: `src/simulation/domain/events/domain-event.ts`
- Create: `src/simulation/domain/events/simulation-started.ts`
- Create: `src/simulation/domain/events/goal-scored.ts`
- Create: `src/simulation/domain/events/simulation-finished.ts`
- Create: `src/simulation/domain/events/simulation-restarted.ts`
- Create: `test/unit/domain/events/domain-events.spec.ts`

- [ ] **Step 1: Failing tests**

`test/unit/domain/events/domain-events.spec.ts`:
```typescript
import { SimulationStarted } from '@simulation/domain/events/simulation-started';
import { GoalScored } from '@simulation/domain/events/goal-scored';
import { SimulationFinished } from '@simulation/domain/events/simulation-finished';
import { SimulationRestarted } from '@simulation/domain/events/simulation-restarted';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { TeamId } from '@simulation/domain/value-objects/team-id';

const simId = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
const at = new Date('2026-04-18T12:00:00Z');

describe('Domain events', () => {
  it('SimulationStarted holds simulationId + startedAt + type', () => {
    const e = new SimulationStarted(simId, at);
    expect(e.type).toBe('SimulationStarted');
    expect(e.simulationId.value).toBe(simId.value);
    expect(e.occurredAt).toBe(at);
  });

  it('GoalScored holds simulationId + teamId + scoreSnapshot + totalGoals', () => {
    const e = new GoalScored(simId, TeamId.create('germany'), [{ matchId: 'm1', home: 1, away: 0 }], 1, at);
    expect(e.type).toBe('GoalScored');
    expect(e.teamId.value).toBe('germany');
    expect(e.totalGoals).toBe(1);
    expect(e.score).toEqual([{ matchId: 'm1', home: 1, away: 0 }]);
  });

  it('SimulationFinished holds reason (manual|auto)', () => {
    const e = new SimulationFinished(simId, 'manual', [], 5, at);
    expect(e.type).toBe('SimulationFinished');
    expect(e.reason).toBe('manual');
  });

  it('SimulationRestarted holds simulationId + restartedAt', () => {
    const e = new SimulationRestarted(simId, at);
    expect(e.type).toBe('SimulationRestarted');
  });
});
```

- [ ] **Step 2: Implement**

`src/simulation/domain/events/domain-event.ts`:
```typescript
import type { SimulationId } from '../value-objects/simulation-id';

export interface DomainEvent {
  readonly type: string;
  readonly simulationId: SimulationId;
  readonly occurredAt: Date;
}
```

`src/simulation/domain/events/simulation-started.ts`:
```typescript
import type { SimulationId } from '../value-objects/simulation-id';
import type { DomainEvent } from './domain-event';

export class SimulationStarted implements DomainEvent {
  readonly type = 'SimulationStarted' as const;

  constructor(
    public readonly simulationId: SimulationId,
    public readonly occurredAt: Date,
  ) {}
}
```

`src/simulation/domain/events/goal-scored.ts`:
```typescript
import type { SimulationId } from '../value-objects/simulation-id';
import type { TeamId } from '../value-objects/team-id';
import type { MatchScoreSnapshot } from '../value-objects/score-board';
import type { DomainEvent } from './domain-event';

export class GoalScored implements DomainEvent {
  readonly type = 'GoalScored' as const;

  constructor(
    public readonly simulationId: SimulationId,
    public readonly teamId: TeamId,
    public readonly score: readonly MatchScoreSnapshot[],
    public readonly totalGoals: number,
    public readonly occurredAt: Date,
  ) {}
}
```

`src/simulation/domain/events/simulation-finished.ts`:
```typescript
import type { SimulationId } from '../value-objects/simulation-id';
import type { MatchScoreSnapshot } from '../value-objects/score-board';
import type { DomainEvent } from './domain-event';

export type FinishReason = 'manual' | 'auto';

export class SimulationFinished implements DomainEvent {
  readonly type = 'SimulationFinished' as const;

  constructor(
    public readonly simulationId: SimulationId,
    public readonly reason: FinishReason,
    public readonly finalScore: readonly MatchScoreSnapshot[],
    public readonly totalGoals: number,
    public readonly occurredAt: Date,
  ) {}
}
```

`src/simulation/domain/events/simulation-restarted.ts`:
```typescript
import type { SimulationId } from '../value-objects/simulation-id';
import type { DomainEvent } from './domain-event';

export class SimulationRestarted implements DomainEvent {
  readonly type = 'SimulationRestarted' as const;

  constructor(
    public readonly simulationId: SimulationId,
    public readonly occurredAt: Date,
  ) {}
}
```

- [ ] **Step 3: Remove .gitkeep, test, commit**

```bash
rm src/simulation/domain/events/.gitkeep
npm test -- domain-events.spec
git add src/simulation/domain/events/ test/unit/domain/events/
git add -u src/simulation/domain/events/.gitkeep
git commit -m "feat(domain): 4 domain events + DomainEvent base type

- DomainEvent interface (type, simulationId, occurredAt)
- SimulationStarted, GoalScored, SimulationFinished (reason: manual|auto),
  SimulationRestarted
- Events carry immutable payload for EventBus serialization in Phase 2"
```

---

## Task 8: InvalidStateError

**Files:**
- Create: `src/simulation/domain/errors/invalid-state.error.ts`

(Test nie jest potrzebny osobny — będzie exercised przez aggregate tests w Task 9-12.)

- [ ] **Step 1: Implement**

`src/simulation/domain/errors/invalid-state.error.ts`:
```typescript
import { DomainError } from './domain.error';

export type SimulationState = 'RUNNING' | 'FINISHED';

export class InvalidStateError extends DomainError {
  constructor(
    public readonly currentState: SimulationState,
    public readonly attemptedAction: string,
  ) {
    super(`Cannot ${attemptedAction} simulation in state ${currentState}`);
  }
}
```

- [ ] **Step 2: Verify compile + commit**

```bash
npx tsc --noEmit
git add src/simulation/domain/errors/invalid-state.error.ts
git commit -m "feat(domain): InvalidStateError for state machine transition violations"
```

---

## Task 9: Simulation aggregate — create + constructor

**Files:**
- Create: `src/simulation/domain/aggregates/simulation.ts`
- Create: `test/unit/domain/aggregates/simulation.spec.ts`

- [ ] **Step 1: Failing test**

`test/unit/domain/aggregates/simulation.spec.ts`:
```typescript
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';

describe('Simulation.create', () => {
  const id = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
  const token = OwnershipToken.create('550e8400-e29b-41d4-a716-446655440001');
  const name = SimulationName.create('Katar 2023');
  const now = new Date('2026-04-18T12:00:00Z');

  it('creates a RUNNING simulation with 0:0 scoreboard', () => {
    const sim = Simulation.create({
      id,
      ownerToken: token,
      name,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now,
    });
    const snap = sim.toSnapshot();
    expect(snap.id).toBe(id.value);
    expect(snap.name).toBe('Katar 2023');
    expect(snap.state).toBe('RUNNING');
    expect(snap.score).toHaveLength(3);
    expect(snap.score.every((s) => s.home === 0 && s.away === 0)).toBe(true);
    expect(snap.totalGoals).toBe(0);
    expect(snap.startedAt).toEqual(now);
    expect(snap.finishedAt).toBeNull();
    expect(snap.profileId).toBe('default');
  });

  it('emits SimulationStarted on create', () => {
    const sim = Simulation.create({
      id,
      ownerToken: token,
      name,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now,
    });
    const events = sim.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('SimulationStarted');
    expect(events[0].simulationId.value).toBe(id.value);
  });

  it('pullEvents empties the buffer', () => {
    const sim = Simulation.create({ id, ownerToken: token, name, matches: PRESET_MATCHES, profileId: 'default', now });
    sim.pullEvents();
    expect(sim.pullEvents()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test, verify fails**

```bash
npm test -- simulation.spec
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement aggregate skeleton + create + pullEvents**

`src/simulation/domain/aggregates/simulation.ts`:
```typescript
import { SimulationId } from '../value-objects/simulation-id';
import { SimulationName } from '../value-objects/simulation-name';
import { Match } from '../value-objects/match';
import { ScoreBoard } from '../value-objects/score-board';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import type { SimulationState } from '../errors/invalid-state.error';
import type { DomainEvent } from '../events/domain-event';
import { SimulationStarted } from '../events/simulation-started';

export interface SimulationSnapshot {
  readonly id: string;
  readonly ownerToken: string;
  readonly name: string;
  readonly state: SimulationState;
  readonly score: ReturnType<ScoreBoard['snapshot']>;
  readonly totalGoals: number;
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly profileId: string;
}

export interface CreateSimulationInput {
  readonly id: SimulationId;
  readonly ownerToken: OwnershipToken;
  readonly name: SimulationName;
  readonly matches: readonly Match[];
  readonly profileId: string;
  readonly now: Date;
}

export class Simulation {
  private pendingEvents: DomainEvent[] = [];

  private constructor(
    public readonly id: SimulationId,
    public readonly ownerToken: OwnershipToken,
    public readonly name: SimulationName,
    public readonly profileId: string,
    private state: SimulationState,
    private score: ScoreBoard,
    private startedAt: Date,
    private finishedAt: Date | null,
    private totalGoals: number,
  ) {}

  static create(input: CreateSimulationInput): Simulation {
    const scoreBoard = ScoreBoard.fromMatches(input.matches);
    const sim = new Simulation(
      input.id,
      input.ownerToken,
      input.name,
      input.profileId,
      'RUNNING',
      scoreBoard,
      input.now,
      null,
      0,
    );
    sim.pendingEvents.push(new SimulationStarted(input.id, input.now));
    return sim;
  }

  pullEvents(): readonly DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  toSnapshot(): SimulationSnapshot {
    return {
      id: this.id.value,
      ownerToken: this.ownerToken.value,
      name: this.name.value,
      state: this.state,
      score: this.score.snapshot(),
      totalGoals: this.totalGoals,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      profileId: this.profileId,
    };
  }
}
```

- [ ] **Step 4: Remove .gitkeep, run tests, commit**

```bash
rm src/simulation/domain/aggregates/.gitkeep
npm test -- simulation.spec
```
Expected: 3 tests PASS.

```bash
git add src/simulation/domain/aggregates/simulation.ts test/unit/domain/aggregates/simulation.spec.ts
git add -u src/simulation/domain/aggregates/.gitkeep
git commit -m "feat(domain): Simulation aggregate — create factory + pullEvents + toSnapshot

- Simulation.create() initializes RUNNING state with 0:0 ScoreBoard from PRESET_MATCHES
- Emits SimulationStarted event to pendingEvents buffer
- pullEvents(): returns and clears buffer (for orchestrator to publish)
- toSnapshot(): read-only view of aggregate state"
```

---

## Task 10: Simulation.applyGoal

**Files:**
- Modify: `src/simulation/domain/aggregates/simulation.ts` (add method)
- Modify: `test/unit/domain/aggregates/simulation.spec.ts` (add describe block)

- [ ] **Step 1: Add failing test block**

Append to `test/unit/domain/aggregates/simulation.spec.ts`:
```typescript
import { TeamId } from '@simulation/domain/value-objects/team-id';
import { InvalidStateError } from '@simulation/domain/errors/invalid-state.error';

describe('Simulation.applyGoal', () => {
  const id = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
  const token = OwnershipToken.create('550e8400-e29b-41d4-a716-446655440001');
  const name = SimulationName.create('Katar 2023');
  const start = new Date('2026-04-18T12:00:00Z');

  function fresh(): Simulation {
    const sim = Simulation.create({ id, ownerToken: token, name, matches: PRESET_MATCHES, profileId: 'default', now: start });
    sim.pullEvents(); // clear creation event
    return sim;
  }

  it('increments score for scoring team and totalGoals', () => {
    const sim = fresh();
    const at = new Date(start.getTime() + 1000);
    sim.applyGoal(TeamId.create('germany'), at);
    const snap = sim.toSnapshot();
    expect(snap.totalGoals).toBe(1);
    expect(snap.score.find((s) => s.matchId === 'germany-vs-poland')).toEqual({
      matchId: 'germany-vs-poland',
      home: 1,
      away: 0,
    });
  });

  it('emits GoalScored event with correct payload', () => {
    const sim = fresh();
    const at = new Date(start.getTime() + 1000);
    sim.applyGoal(TeamId.create('poland'), at);
    const events = sim.pullEvents();
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.type).toBe('GoalScored');
    // type narrowing check
    if (e.type === 'GoalScored') {
      expect(e.teamId.value).toBe('poland');
      expect(e.totalGoals).toBe(1);
      expect(e.occurredAt).toEqual(at);
    }
  });

  it('rejects applyGoal when state is FINISHED', () => {
    const sim = fresh();
    sim.finish('manual', new Date(start.getTime() + 5000));
    expect(() => sim.applyGoal(TeamId.create('germany'), new Date())).toThrow(InvalidStateError);
  });
});
```

- [ ] **Step 2: Implement applyGoal in aggregate**

Add to `src/simulation/domain/aggregates/simulation.ts` (after `pullEvents`):
```typescript
  applyGoal(teamId: TeamId, now: Date): void {
    if (this.state !== 'RUNNING') {
      throw new InvalidStateError(this.state, 'apply goal to');
    }
    this.score = this.score.increment(teamId);
    this.totalGoals++;
    this.pendingEvents.push(
      new GoalScored(this.id, teamId, this.score.snapshot(), this.totalGoals, now),
    );
  }
```

Add missing imports at top of `simulation.ts`:
```typescript
import { TeamId } from '../value-objects/team-id';
import { InvalidStateError } from '../errors/invalid-state.error';
import { GoalScored } from '../events/goal-scored';
```

**Note:** `finish()` method called in third test is implemented in Task 11; test block fails until both tasks are done. OK to commit partially and add method in Task 11.

- [ ] **Step 3: Run tests, verify first 2 applyGoal tests pass (third fails — relies on finish())**

```bash
npm test -- simulation.spec
```
Expected: 2 tests PASS (from applyGoal describe), 1 test FAIL (finish() not implemented yet).

- [ ] **Step 4: Commit partial (TDD red remains for finish test)**

```bash
git add src/simulation/domain/aggregates/simulation.ts test/unit/domain/aggregates/simulation.spec.ts
git commit -m "feat(domain): Simulation.applyGoal — increments score, emits GoalScored

- Rejects when state !== RUNNING (InvalidStateError)
- Uses ScoreBoard.increment (immutable rebind)
- Test for FINISHED state rejection depends on finish() (Task 11)"
```

---

## Task 11: Simulation.finish (manual + auto)

**Files:**
- Modify: `src/simulation/domain/aggregates/simulation.ts`
- Modify: `test/unit/domain/aggregates/simulation.spec.ts`

- [ ] **Step 1: Add test block**

Append to `simulation.spec.ts`:
```typescript
describe('Simulation.finish', () => {
  const id = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
  const token = OwnershipToken.create('550e8400-e29b-41d4-a716-446655440001');
  const name = SimulationName.create('Katar 2023');
  const start = new Date('2026-04-18T12:00:00Z');

  function fresh(): Simulation {
    const sim = Simulation.create({ id, ownerToken: token, name, matches: PRESET_MATCHES, profileId: 'default', now: start });
    sim.pullEvents();
    return sim;
  }

  it('transitions RUNNING -> FINISHED with manual reason', () => {
    const sim = fresh();
    const at = new Date(start.getTime() + 5000);
    sim.finish('manual', at);
    const snap = sim.toSnapshot();
    expect(snap.state).toBe('FINISHED');
    expect(snap.finishedAt).toEqual(at);
  });

  it('emits SimulationFinished with reason and final score', () => {
    const sim = fresh();
    sim.applyGoal(TeamId.create('germany'), new Date(start.getTime() + 1000));
    sim.pullEvents();
    const at = new Date(start.getTime() + 5000);
    sim.finish('manual', at);
    const events = sim.pullEvents();
    expect(events).toHaveLength(1);
    const e = events[0];
    if (e.type === 'SimulationFinished') {
      expect(e.reason).toBe('manual');
      expect(e.totalGoals).toBe(1);
    }
  });

  it('rejects finish when already FINISHED', () => {
    const sim = fresh();
    sim.finish('manual', new Date(start.getTime() + 5000));
    expect(() => sim.finish('auto', new Date(start.getTime() + 9000))).toThrow(InvalidStateError);
  });

  it('accepts reason=auto as well', () => {
    const sim = fresh();
    sim.finish('auto', new Date(start.getTime() + 9000));
    expect(sim.toSnapshot().state).toBe('FINISHED');
  });
});
```

- [ ] **Step 2: Implement finish**

Add to `simulation.ts`:
```typescript
import type { FinishReason } from '../events/simulation-finished';
import { SimulationFinished } from '../events/simulation-finished';

// ...inside class:
  finish(reason: FinishReason, now: Date): void {
    if (this.state !== 'RUNNING') {
      throw new InvalidStateError(this.state, 'finish');
    }
    this.state = 'FINISHED';
    this.finishedAt = now;
    this.pendingEvents.push(
      new SimulationFinished(this.id, reason, this.score.snapshot(), this.totalGoals, now),
    );
  }
```

- [ ] **Step 3: Run tests (all passing now, including the earlier applyGoal-on-finished test)**

```bash
npm test -- simulation.spec
```
Expected: all previous failing tests PASS. Total so far ~10 aggregate tests.

- [ ] **Step 4: Commit**

```bash
git add src/simulation/domain/aggregates/simulation.ts test/unit/domain/aggregates/simulation.spec.ts
git commit -m "feat(domain): Simulation.finish — transitions RUNNING -> FINISHED with reason

- Accepts 'manual' | 'auto' reason
- Rejects when already FINISHED (InvalidStateError)
- Emits SimulationFinished with final score snapshot and totalGoals"
```

---

## Task 12: Simulation.restart

**Files:**
- Modify: `src/simulation/domain/aggregates/simulation.ts`
- Modify: `test/unit/domain/aggregates/simulation.spec.ts`

- [ ] **Step 1: Add test block**

Append:
```typescript
describe('Simulation.restart', () => {
  const id = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
  const token = OwnershipToken.create('550e8400-e29b-41d4-a716-446655440001');
  const name = SimulationName.create('Katar 2023');
  const start = new Date('2026-04-18T12:00:00Z');

  function finished(): Simulation {
    const sim = Simulation.create({ id, ownerToken: token, name, matches: PRESET_MATCHES, profileId: 'default', now: start });
    sim.applyGoal(TeamId.create('germany'), new Date(start.getTime() + 1000));
    sim.applyGoal(TeamId.create('poland'), new Date(start.getTime() + 2000));
    sim.finish('manual', new Date(start.getTime() + 5000));
    sim.pullEvents();
    return sim;
  }

  it('transitions FINISHED -> RUNNING, resets score and totalGoals', () => {
    const sim = finished();
    const restartAt = new Date(start.getTime() + 10000);
    sim.restart(restartAt);
    const snap = sim.toSnapshot();
    expect(snap.state).toBe('RUNNING');
    expect(snap.totalGoals).toBe(0);
    expect(snap.score.every((s) => s.home === 0 && s.away === 0)).toBe(true);
    expect(snap.startedAt).toEqual(restartAt);
    expect(snap.finishedAt).toBeNull();
  });

  it('emits SimulationRestarted', () => {
    const sim = finished();
    sim.restart(new Date(start.getTime() + 10000));
    const events = sim.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('SimulationRestarted');
  });

  it('rejects restart when RUNNING', () => {
    const sim = Simulation.create({ id, ownerToken: token, name, matches: PRESET_MATCHES, profileId: 'default', now: start });
    expect(() => sim.restart(new Date())).toThrow(InvalidStateError);
  });
});
```

- [ ] **Step 2: Implement restart**

Add to `simulation.ts`:
```typescript
import { SimulationRestarted } from '../events/simulation-restarted';

// ...inside class:
  restart(now: Date): void {
    if (this.state !== 'FINISHED') {
      throw new InvalidStateError(this.state, 'restart');
    }
    this.state = 'RUNNING';
    this.score = this.score.reset();
    this.totalGoals = 0;
    this.startedAt = now;
    this.finishedAt = null;
    this.pendingEvents.push(new SimulationRestarted(this.id, now));
  }
```

- [ ] **Step 3: Run, verify, commit**

```bash
npm test -- simulation.spec
```
Expected: all aggregate tests PASS (~13 total).

```bash
git add src/simulation/domain/aggregates/simulation.ts test/unit/domain/aggregates/simulation.spec.ts
git commit -m "feat(domain): Simulation.restart — FINISHED -> RUNNING with score + totalGoals reset

- Resets ScoreBoard via .reset()
- Resets totalGoals and finishedAt, updates startedAt to restart time
- Emits SimulationRestarted
- Rejects when RUNNING (InvalidStateError)"
```

---

## Task 13: Fill port interfaces — Simulation context

**Files (modify — replace empty interface bodies with real signatures):**
- `src/simulation/domain/ports/clock.port.ts`
- `src/simulation/domain/ports/random-provider.port.ts`
- `src/simulation/domain/ports/simulation-repository.port.ts`
- `src/simulation/domain/ports/event-publisher.port.ts`
- `src/simulation/domain/ports/simulation-engine.port.ts`
- `src/simulation/domain/ports/match-dynamics.port.ts`
- `src/simulation/domain/ports/retention-policy.port.ts`
- `src/simulation/domain/ports/throttle-policy.port.ts`

**Also:** remove ESLint override for `no-empty-interface` on port files since all will have method signatures now.

- [ ] **Step 1: Replace `clock.port.ts`**

```typescript
/**
 * Time abstraction port.
 * Default impl: SystemClock (Phase 1b). Test impl: FakeClock with advance(ms).
 */
export interface Clock {
  now(): Date;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
```

- [ ] **Step 2: Replace `random-provider.port.ts`**

```typescript
/**
 * Randomness abstraction port.
 * Default impl: CryptoRandomProvider (Phase 1b). Test impl: SeededRandom(seed).
 */
export interface RandomProvider {
  int(min: number, max: number): number;
  uuid(): string;
}
```

- [ ] **Step 3: Replace `simulation-repository.port.ts`**

```typescript
import type { Simulation } from '../aggregates/simulation';
import type { SimulationId } from '../value-objects/simulation-id';
import type { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';

/**
 * Persistence port for Simulation aggregate.
 * Default impl: InMemorySimulationRepository (Phase 1b). Future: PostgresSimulationRepository (Phase 4).
 */
export interface SimulationRepository {
  save(simulation: Simulation): Promise<void>;
  findById(id: SimulationId): Promise<Simulation | null>;
  findAll(): Promise<readonly Simulation[]>;
  findByOwner(token: OwnershipToken): Promise<readonly Simulation[]>;
  delete(id: SimulationId): Promise<void>;
}
```

- [ ] **Step 4: Replace `event-publisher.port.ts`**

```typescript
import type { DomainEvent } from '../events/domain-event';

/**
 * Domain event publication port (observer-facing).
 * Default impl: InMemoryEventPublisher wrapping EventBus (Phase 1b).
 */
export interface EventPublisher {
  publish(event: DomainEvent): Promise<void>;
}
```

- [ ] **Step 5: Replace `simulation-engine.port.ts`**

```typescript
import type { Simulation } from '../aggregates/simulation';
import type { DomainEvent } from '../events/domain-event';

/**
 * Simulation runtime port (streaming-based per design spec §6.3).
 * Default impl: TickingSimulationEngine (Phase 1b). Injects: Clock + MatchDynamics.
 *
 * run() drives the ticking loop until either MatchDynamics.nextStep returns undefined
 * (natural completion, engine emits SimulationFinished with reason 'auto') or signal aborts
 * (manual finish — engine returns without emitting; orchestrator emits finished with reason 'manual').
 */
export interface SimulationEngine {
  run(
    simulation: Simulation,
    emit: (event: DomainEvent) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void>;
}
```

- [ ] **Step 6: Replace `match-dynamics.port.ts`**

```typescript
import type { Simulation } from '../aggregates/simulation';
import type { DomainEvent } from '../events/domain-event';

export interface TimedEvent {
  readonly delayMs: number;
  readonly event: DomainEvent;
}

/**
 * Decision strategy port — "what event and when".
 * Default impl: UniformRandomGoalDynamics (1/6 team, 9 goals, 1s interval) — Phase 1b.
 * Future: PoissonGoalDynamics, RichEventDynamics (Phase 3).
 *
 * nextStep() returns undefined when the match is naturally finished (engine auto-finishes).
 */
export interface MatchDynamics {
  nextStep(simulation: Simulation, tickIndex: number): Promise<TimedEvent | undefined>;
}
```

- [ ] **Step 7: Replace `retention-policy.port.ts`**

```typescript
import type { Simulation } from '../aggregates/simulation';

/**
 * GC policy for FINISHED simulations.
 * Default impl: TtlRetentionPolicy(1h) — Phase 1b.
 */
export interface RetentionPolicy {
  shouldRemove(simulation: Simulation, now: Date): boolean;
}
```

- [ ] **Step 8: Replace `throttle-policy.port.ts`**

```typescript
import type { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';

/**
 * Ignition throttle rule (5s cooldown per token; per-user in Phase 4+).
 * Default impl: FiveSecondCooldownPolicy — Phase 1b.
 */
export interface ThrottlePolicy {
  canIgnite(token: OwnershipToken, lastIgnitionAt: Date | null, now: Date): boolean;
}
```

- [ ] **Step 9: Remove ESLint override for port stubs (no longer empty)**

Modify `.eslintrc.cjs`:
```diff
-  overrides: [
-    {
-      // Phase 0 port stubs are intentionally empty; Phase 1 fills signatures.
-      files: ['src/**/ports/*.port.ts', 'src/shared/messaging/*.port.ts'],
-      rules: {
-        '@typescript-eslint/no-empty-interface': 'off',
-      },
-    },
-  ],
```

- [ ] **Step 10: Run all gates**

```bash
npm run lint && npx tsc --noEmit && npm test
```
Expected: all green (no test changes, just port signatures).

- [ ] **Step 11: Commit**

```bash
git add src/simulation/domain/ports/ .eslintrc.cjs
git commit -m "feat(domain): fill port signatures for simulation context + drop empty-interface override

- Clock: now + sleep (with optional AbortSignal)
- RandomProvider: int + uuid
- SimulationRepository: save/findById/findAll/findByOwner/delete
- EventPublisher: publish
- SimulationEngine: streaming-based run(sim, emit, signal) per D14
- MatchDynamics: nextStep returning { delayMs, event } | undefined
- RetentionPolicy: shouldRemove(sim, now)
- ThrottlePolicy: canIgnite(token, lastIgnitionAt, now)
- Removed .eslintrc.cjs override since interfaces are no longer empty"
```

---

## Task 14: Fill port interfaces — Ownership + Shared Messaging

**Files:**
- Modify: `src/ownership/domain/ports/ownership-repository.port.ts`
- Modify: `src/ownership/domain/ports/ownership-token-generator.port.ts`
- Modify: `src/shared/messaging/command-bus.port.ts`
- Modify: `src/shared/messaging/event-bus.port.ts`

- [ ] **Step 1: Replace `ownership-repository.port.ts`**

```typescript
import type { OwnershipToken } from '../value-objects/ownership-token';

export interface OwnershipRecord {
  readonly token: OwnershipToken;
  readonly createdAt: Date;
  readonly lastIgnitionAt: Date | null;
}

/**
 * Ownership token persistence port.
 * Default impl: InMemoryOwnershipRepository — Phase 1b.
 */
export interface OwnershipRepository {
  save(record: OwnershipRecord): Promise<void>;
  findByToken(token: OwnershipToken): Promise<OwnershipRecord | null>;
  updateLastIgnitionAt(token: OwnershipToken, now: Date): Promise<void>;
}
```

- [ ] **Step 2: Replace `ownership-token-generator.port.ts`**

```typescript
import type { OwnershipToken } from '../value-objects/ownership-token';

/**
 * Token generation port (UUID v4 in Phase 1, JWT in Phase 4+).
 * Default impl: UuidTokenGenerator — Phase 1b.
 */
export interface OwnershipTokenGenerator {
  generate(): OwnershipToken;
}
```

- [ ] **Step 3: Replace `command-bus.port.ts`**

```typescript
export interface Command {
  readonly type: string;
}

export interface Subscription {
  unsubscribe(): Promise<void>;
}

/**
 * Command dispatch port.
 * Default impl (Phase 1): InMemoryCommandBus (Node EventEmitter).
 * Later (Phase 2): BullMQCommandBus (Redis-backed, cross-process).
 */
export interface CommandBus {
  dispatch<C extends Command>(topic: string, command: C): Promise<void>;
  subscribe<C extends Command>(topic: string, handler: (command: C) => Promise<void>): Subscription;
}
```

- [ ] **Step 4: Replace `event-bus.port.ts`**

```typescript
import type { DomainEvent } from '@simulation/domain/events/domain-event';
import type { Subscription } from './command-bus.port';

export interface EventMeta {
  readonly simulationId?: string;
  readonly correlationId?: string;
}

export type EventFilter = (event: DomainEvent, meta: EventMeta) => boolean;

/**
 * Event publish/subscribe port.
 * Default impl (Phase 1): InMemoryEventBus.
 * Later (Phase 2): BullMQEventBus.
 */
export interface EventBus {
  publish(event: DomainEvent, meta?: EventMeta): Promise<void>;
  subscribe(
    filter: EventFilter,
    handler: (event: DomainEvent, meta: EventMeta) => Promise<void>,
  ): Subscription;
}
```

- [ ] **Step 5: Gates + commit**

```bash
npm run lint && npx tsc --noEmit && npm test
git add src/ownership/domain/ports/ src/shared/messaging/
git commit -m "feat(domain): fill port signatures for ownership + shared messaging

- OwnershipRepository: save/findByToken/updateLastIgnitionAt + OwnershipRecord type
- OwnershipTokenGenerator: generate() -> OwnershipToken
- CommandBus: dispatch/subscribe + Command + Subscription types
- EventBus: publish/subscribe + EventMeta + EventFilter types"
```

---

## Task 15: Phase 1a — final verification + push

- [ ] **Step 1: Run full quality gates**

```bash
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```
Expected: all green. Test count should be ~50+ (all VO + events + aggregate).

- [ ] **Step 2: Verify test coverage (optional spot-check)**

```bash
npm run test:cov
```
Expected: `src/simulation/domain/**` and `src/ownership/domain/**` at 90%+ line coverage. Ports and events are data structures — coverage may show uncovered branches for untested constructors; not a blocker.

- [ ] **Step 3: Check git log — Phase 1a commits are clean & atomic**

```bash
git log --oneline main..HEAD
```
Expected: ~14 atomic commits from `feat(domain):` and `feat(domain): fill port signatures...`.

- [ ] **Step 4: Push branch (create phase-1a-domain branch first if not on one)**

If you started this plan on a feature branch (recommended — don't merge 1a to main before 1c completes):

```bash
# Verify branch name
git branch --show-current
# If you're on main, redo: git checkout -b phase-1-mvp-in-process
```

When ready:
```bash
git push -u origin <branch-name>
```

**No tag yet** — `v1.0-mvp-in-process` tag is created at the end of Phase 1c (after Application + Gateway + Integration/E2E tests).

- [ ] **Step 5: Report readiness for Phase 1b**

Document briefly in CHANGELOG or a short PR description:

```
Phase 1a: Domain layer complete

- 9 Value Objects with Zod validation + 40+ unit tests
- 4 domain events + DomainEvent interface
- Simulation aggregate with state machine (RUNNING <-> FINISHED) + invariants
- All 10 ports filled with method signatures
- ESLint no-empty-interface override removed (ports no longer empty)

Next: Phase 1b — Infrastructure adapters (Engine, Dynamics, Clock, Random, Repos, Policies, Buses).
```

CHANGELOG update (insert under `[Unreleased]`):

```markdown
### Added (Phase 1a — domain layer)
- Value Objects: SimulationId, SimulationName, TeamId, MatchId, Team, Match, ScoreBoard, OwnershipToken
- PRESET_MATCHES constant (3 fixed matches per PDF requirement)
- Domain events: SimulationStarted, GoalScored, SimulationFinished, SimulationRestarted
- Simulation aggregate with state machine (RUNNING <-> FINISHED), apply/finish/restart operations, pendingEvents buffer
- All 10 port interfaces filled with method signatures (Clock, RandomProvider, SimulationRepository, EventPublisher, SimulationEngine, MatchDynamics, RetentionPolicy, ThrottlePolicy, OwnershipRepository, OwnershipTokenGenerator, CommandBus, EventBus)
- 40+ unit tests covering all VOs, events, aggregate transitions, and invariants

### Changed
- .eslintrc.cjs: removed no-empty-interface override (ports no longer empty)
```

Commit CHANGELOG:
```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG entry for Phase 1a (domain layer complete)"
```

---

## Phase 1a — Task summary

| # | Task | Deliverable |
|---|---|---|
| 1 | TeamId + MatchId VOs + errors | 8 unit tests |
| 2 | Team + Match + PRESET_MATCHES | 10 unit tests |
| 3 | SimulationId VO | 5 unit tests |
| 4 | SimulationName VO (Unicode regex) | 14 unit tests |
| 5 | ScoreBoard VO (immutable ops) | 6 unit tests |
| 6 | OwnershipToken VO | 5 unit tests |
| 7 | Domain events (4 types + base) | 4 structural tests |
| 8 | InvalidStateError | (exercised in aggregate tests) |
| 9 | Simulation.create + pullEvents + toSnapshot | 3 tests |
| 10 | Simulation.applyGoal | 3 tests |
| 11 | Simulation.finish | 4 tests |
| 12 | Simulation.restart | 3 tests |
| 13 | Fill simulation port signatures | type-check only |
| 14 | Fill ownership + messaging port signatures | type-check only |
| 15 | Final verification + CHANGELOG + push | all gates green |

**Expected test count after Phase 1a:** ~60 unit tests, all green, <500ms total runtime.

**No tag is created** — phase 1 is delivered as a unit after 1c.

**Post-implementation quality gates** (simplify + security review) are deferred to the end of Phase 1c (complete MVP) to avoid fragmenting review effort.
