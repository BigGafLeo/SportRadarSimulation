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
    const e = new GoalScored(
      simId,
      TeamId.create('germany'),
      [{ matchId: 'm1', home: 1, away: 0 }],
      1,
      at,
    );
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
