import { FiveSecondCooldownPolicy } from '@simulation/infrastructure/policies/five-second-cooldown.policy';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';

describe('FiveSecondCooldownPolicy', () => {
  const token = OwnershipToken.create('550e8400-e29b-41d4-a716-446655440010');
  const policy = new FiveSecondCooldownPolicy(5000);

  it('allows ignition when lastIgnitionAt is null', () => {
    expect(policy.canIgnite(token, null, new Date())).toBe(true);
  });

  it('blocks ignition within cooldown window', () => {
    const last = new Date('2026-04-18T12:00:00Z');
    const now = new Date('2026-04-18T12:00:04Z');
    expect(policy.canIgnite(token, last, now)).toBe(false);
  });

  it('allows ignition at exact cooldown boundary', () => {
    const last = new Date('2026-04-18T12:00:00Z');
    const now = new Date('2026-04-18T12:00:05Z');
    expect(policy.canIgnite(token, last, now)).toBe(true);
  });

  it('allows ignition well after cooldown', () => {
    const last = new Date('2026-04-18T12:00:00Z');
    const now = new Date('2026-04-18T12:01:00Z');
    expect(policy.canIgnite(token, last, now)).toBe(true);
  });

  it('respects custom cooldown value', () => {
    const shortPolicy = new FiveSecondCooldownPolicy(1000);
    const last = new Date('2026-04-18T12:00:00Z');
    const now = new Date('2026-04-18T12:00:00.999Z');
    expect(shortPolicy.canIgnite(token, last, now)).toBe(false);
    const now2 = new Date('2026-04-18T12:00:01Z');
    expect(shortPolicy.canIgnite(token, last, now2)).toBe(true);
  });
});
