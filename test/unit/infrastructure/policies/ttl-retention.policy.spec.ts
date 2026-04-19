import { TtlRetentionPolicy } from '@simulation/infrastructure/policies/ttl-retention.policy';
import { Simulation } from '@simulation/domain/aggregates/simulation';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { SimulationName } from '@simulation/domain/value-objects/simulation-name';
import { PRESET_MATCHES } from '@simulation/domain/value-objects/matches-preset';

function makeSim(startedAt: Date): Simulation {
  return Simulation.create({
    id: SimulationId.create('550e8400-e29b-41d4-a716-446655440000'),
    ownerId: 'user-uuid-retention-test',
    name: SimulationName.create('Katar 2023'),
    matches: PRESET_MATCHES,
    profileId: 'default',
    now: startedAt,
  });
}

describe('TtlRetentionPolicy', () => {
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const policy = new TtlRetentionPolicy(ONE_HOUR_MS);

  it('does not remove RUNNING simulation regardless of age', () => {
    const start = new Date('2026-04-18T10:00:00Z');
    const sim = makeSim(start);
    const muchLater = new Date(start.getTime() + 24 * ONE_HOUR_MS);
    expect(policy.shouldRemove(sim, muchLater)).toBe(false);
  });

  it('does not remove FINISHED sim younger than TTL', () => {
    const start = new Date('2026-04-18T10:00:00Z');
    const sim = makeSim(start);
    sim.finish('auto', new Date(start.getTime() + 9000));
    const check = new Date(start.getTime() + 30 * 60 * 1000);
    expect(policy.shouldRemove(sim, check)).toBe(false);
  });

  it('removes FINISHED sim older than TTL', () => {
    const start = new Date('2026-04-18T10:00:00Z');
    const sim = makeSim(start);
    const finishedAt = new Date(start.getTime() + 9000);
    sim.finish('auto', finishedAt);
    const check = new Date(finishedAt.getTime() + ONE_HOUR_MS + 1);
    expect(policy.shouldRemove(sim, check)).toBe(true);
  });

  it('removes at exact TTL boundary', () => {
    const start = new Date('2026-04-18T10:00:00Z');
    const sim = makeSim(start);
    const finishedAt = new Date(start.getTime() + 9000);
    sim.finish('auto', finishedAt);
    const check = new Date(finishedAt.getTime() + ONE_HOUR_MS);
    expect(policy.shouldRemove(sim, check)).toBe(true);
  });
});
