import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import { TeamId } from '@simulation/domain/value-objects/team-id';
import { InvalidStateError } from '@simulation/domain/errors/invalid-state.error';
import type { GoalScored } from '@simulation/domain/events/goal-scored';

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
    const sim = Simulation.create({
      id,
      ownerToken: token,
      name,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now,
    });
    sim.pullEvents();
    expect(sim.pullEvents()).toHaveLength(0);
  });
});

describe('Simulation.applyGoal', () => {
  const id = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
  const token = OwnershipToken.create('550e8400-e29b-41d4-a716-446655440001');
  const name = SimulationName.create('Katar 2023');
  const start = new Date('2026-04-18T12:00:00Z');

  function fresh(): Simulation {
    const sim = Simulation.create({
      id,
      ownerToken: token,
      name,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: start,
    });
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
    const e = events[0] as GoalScored;
    expect(e.type).toBe('GoalScored');
    expect(e.teamId.value).toBe('poland');
    expect(e.totalGoals).toBe(1);
    expect(e.occurredAt).toEqual(at);
  });

  it.skip('rejects applyGoal when state is FINISHED (enabled in Task 11 when finish() exists)', () => {
    const sim = fresh();
    // @ts-expect-error finish() added in Task 11
    sim.finish('manual', new Date(start.getTime() + 5000));
    expect(() => sim.applyGoal(TeamId.create('germany'), new Date())).toThrow(InvalidStateError);
  });
});
