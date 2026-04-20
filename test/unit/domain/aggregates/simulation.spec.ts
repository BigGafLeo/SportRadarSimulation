import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';
import { TeamId } from '@simulation/domain/value-objects/team-id';
import { InvalidStateError } from '@simulation/domain/errors/invalid-state.error';
import type { GoalScored } from '@simulation/domain/events/goal-scored';
import type { SimulationFinished } from '@simulation/domain/events/simulation-finished';
import type { SimulationStarted } from '@simulation/domain/events/simulation-started';

describe('Simulation.create', () => {
  const id = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
  const ownerId = '550e8400-e29b-41d4-a716-446655440001';
  const name = SimulationName.create('Katar 2023');
  const now = new Date('2026-04-18T12:00:00Z');

  it('creates a RUNNING simulation with 0:0 scoreboard', () => {
    const sim = Simulation.create({
      id,
      ownerId,
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
      ownerId,
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
      ownerId,
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
  const ownerId = '550e8400-e29b-41d4-a716-446655440001';
  const name = SimulationName.create('Katar 2023');
  const start = new Date('2026-04-18T12:00:00Z');

  function fresh(): Simulation {
    const sim = Simulation.create({
      id,
      ownerId,
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

  it('rejects applyGoal when state is FINISHED', () => {
    const sim = fresh();
    sim.finish('manual', new Date(start.getTime() + 5000));
    expect(() => sim.applyGoal(TeamId.create('germany'), new Date())).toThrow(InvalidStateError);
  });
});

describe('Simulation.finish', () => {
  const id = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
  const ownerId = '550e8400-e29b-41d4-a716-446655440001';
  const name = SimulationName.create('Katar 2023');
  const start = new Date('2026-04-18T12:00:00Z');

  function fresh(): Simulation {
    const sim = Simulation.create({
      id,
      ownerId,
      name,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: start,
    });
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
    const e = events[0] as SimulationFinished;
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

describe('Simulation.restart', () => {
  const id = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
  const ownerId = '550e8400-e29b-41d4-a716-446655440001';
  const name = SimulationName.create('Katar 2023');
  const start = new Date('2026-04-18T12:00:00Z');

  function finished(): Simulation {
    const sim = Simulation.create({
      id,
      ownerId,
      name,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: start,
    });
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
    const sim = Simulation.create({
      id,
      ownerId,
      name,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: start,
    });
    expect(() => sim.restart(new Date())).toThrow(InvalidStateError);
  });
});

describe('Simulation multi-cycle (create → finish → restart → applyGoal → finish → restart)', () => {
  const id = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
  const ownerId = '550e8400-e29b-41d4-a716-446655440001';
  const name = SimulationName.create('Katar 2023');
  const start = new Date('2026-04-18T12:00:00Z');

  it('score resets to 0:0 on each restart', () => {
    const sim = Simulation.create({
      id,
      ownerId,
      name,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: start,
    });
    sim.pullEvents();

    sim.applyGoal(TeamId.create('germany'), new Date(start.getTime() + 1000));
    sim.applyGoal(TeamId.create('poland'), new Date(start.getTime() + 2000));
    sim.finish('auto', new Date(start.getTime() + 9000));
    sim.pullEvents();

    const restartAt1 = new Date(start.getTime() + 10000);
    sim.restart(restartAt1);
    sim.pullEvents();
    let snap = sim.toSnapshot();
    expect(snap.state).toBe('RUNNING');
    expect(snap.totalGoals).toBe(0);
    expect(snap.score.every((s) => s.home === 0 && s.away === 0)).toBe(true);
    expect(snap.startedAt).toEqual(restartAt1);

    sim.applyGoal(TeamId.create('brazil'), new Date(restartAt1.getTime() + 1000));
    sim.applyGoal(TeamId.create('brazil'), new Date(restartAt1.getTime() + 2000));
    sim.applyGoal(TeamId.create('brazil'), new Date(restartAt1.getTime() + 3000));
    sim.finish('manual', new Date(restartAt1.getTime() + 9000));
    sim.pullEvents();

    const restartAt2 = new Date(restartAt1.getTime() + 20000);
    sim.restart(restartAt2);
    sim.pullEvents();
    snap = sim.toSnapshot();
    expect(snap.state).toBe('RUNNING');
    expect(snap.totalGoals).toBe(0);
    expect(snap.score.every((s) => s.home === 0 && s.away === 0)).toBe(true);
    expect(snap.startedAt).toEqual(restartAt2);
  });

  it('applyGoal after finish+restart works correctly', () => {
    const sim = Simulation.create({
      id,
      ownerId,
      name,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: start,
    });
    sim.pullEvents();
    sim.finish('auto', new Date(start.getTime() + 9000));
    sim.pullEvents();
    sim.restart(new Date(start.getTime() + 10000));
    sim.pullEvents();

    sim.applyGoal(TeamId.create('germany'), new Date(start.getTime() + 11000));
    const snap = sim.toSnapshot();
    expect(snap.totalGoals).toBe(1);
    expect(snap.score.find((s) => s.matchId === 'germany-vs-poland')).toEqual({
      matchId: 'germany-vs-poland',
      home: 1,
      away: 0,
    });
  });
});

describe('Simulation event ordering', () => {
  const id = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
  const ownerId = '550e8400-e29b-41d4-a716-446655440001';
  const name = SimulationName.create('Katar 2023');
  const start = new Date('2026-04-18T12:00:00Z');

  it('create emits SimulationStarted first, then applyGoal emits GoalScored, then finish emits SimulationFinished', () => {
    const sim = Simulation.create({
      id,
      ownerId,
      name,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: start,
    });

    const createEvents = sim.pullEvents();
    expect(createEvents).toHaveLength(1);
    expect(createEvents[0].type).toBe('SimulationStarted');
    const startedEvent = createEvents[0] as SimulationStarted;
    expect(startedEvent.simulationId.value).toBe(id.value);

    sim.applyGoal(TeamId.create('germany'), new Date(start.getTime() + 1000));
    const goalEvents1 = sim.pullEvents();
    expect(goalEvents1).toHaveLength(1);
    expect(goalEvents1[0].type).toBe('GoalScored');

    sim.applyGoal(TeamId.create('poland'), new Date(start.getTime() + 2000));
    const goalEvents2 = sim.pullEvents();
    expect(goalEvents2).toHaveLength(1);
    expect(goalEvents2[0].type).toBe('GoalScored');

    sim.finish('manual', new Date(start.getTime() + 5000));
    const finishEvents = sim.pullEvents();
    expect(finishEvents).toHaveLength(1);
    expect(finishEvents[0].type).toBe('SimulationFinished');
    const finishedEvent = finishEvents[0] as SimulationFinished;
    expect(finishedEvent.reason).toBe('manual');
    expect(finishedEvent.totalGoals).toBe(2);

    expect(sim.pullEvents()).toHaveLength(0);
  });

  it('accumulated events between pulls arrive in insertion order', () => {
    const sim = Simulation.create({
      id,
      ownerId,
      name,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: start,
    });
    sim.applyGoal(TeamId.create('germany'), new Date(start.getTime() + 1000));
    sim.applyGoal(TeamId.create('poland'), new Date(start.getTime() + 2000));
    sim.finish('auto', new Date(start.getTime() + 5000));

    const allEvents = sim.pullEvents();
    expect(allEvents).toHaveLength(4);
    expect(allEvents[0].type).toBe('SimulationStarted');
    expect(allEvents[1].type).toBe('GoalScored');
    expect(allEvents[2].type).toBe('GoalScored');
    expect(allEvents[3].type).toBe('SimulationFinished');
  });
});

describe('Simulation.fromSnapshot', () => {
  const idfs = SimulationId.create('550e8400-e29b-41d4-a716-446655440000');
  const ownerIdfs = '550e8400-e29b-41d4-a716-446655440001';
  const namefs = SimulationName.create('Katar 2023');
  const startfs = new Date('2026-04-18T12:00:00Z');

  it('round-trips via toSnapshot + fromSnapshot (RUNNING, no goals)', () => {
    const orig = Simulation.create({
      id: idfs,
      ownerId: ownerIdfs,
      name: namefs,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: startfs,
    });
    orig.pullEvents();
    const snap = orig.toSnapshot();
    const restored = Simulation.fromSnapshot(snap, PRESET_MATCHES);
    expect(restored.toSnapshot()).toEqual(snap);
  });

  it('round-trips after goals + finish', () => {
    const orig = Simulation.create({
      id: idfs,
      ownerId: ownerIdfs,
      name: namefs,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: startfs,
    });
    orig.applyGoal(TeamId.create('germany'), new Date(startfs.getTime() + 1000));
    orig.applyGoal(TeamId.create('poland'), new Date(startfs.getTime() + 2000));
    orig.finish('auto', new Date(startfs.getTime() + 9000));
    orig.pullEvents();
    const snap = orig.toSnapshot();
    const restored = Simulation.fromSnapshot(snap, PRESET_MATCHES);
    expect(restored.toSnapshot()).toEqual(snap);
  });

  it('restored aggregate emits events correctly on further mutation', () => {
    const orig = Simulation.create({
      id: idfs,
      ownerId: ownerIdfs,
      name: namefs,
      matches: PRESET_MATCHES,
      profileId: 'default',
      now: startfs,
    });
    orig.pullEvents();
    const restored = Simulation.fromSnapshot(orig.toSnapshot(), PRESET_MATCHES);
    restored.applyGoal(TeamId.create('germany'), new Date(startfs.getTime() + 1000));
    const events = restored.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('GoalScored');
  });
});
