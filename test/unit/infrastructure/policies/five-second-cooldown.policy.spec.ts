import { FiveSecondCooldownPolicy } from '@simulation/infrastructure/policies/five-second-cooldown.policy';

describe('FiveSecondCooldownPolicy', () => {
  const userId = 'test-user-id';
  const policy = new FiveSecondCooldownPolicy(5000);

  it('allows ignition when lastIgnitionAt is null', () => {
    expect(policy.canIgnite(userId, null, new Date())).toBe(true);
  });

  it('blocks ignition within cooldown window', () => {
    const last = new Date('2026-04-18T12:00:00Z');
    const now = new Date('2026-04-18T12:00:04Z');
    expect(policy.canIgnite(userId, last, now)).toBe(false);
  });

  it('allows ignition at exact cooldown boundary', () => {
    const last = new Date('2026-04-18T12:00:00Z');
    const now = new Date('2026-04-18T12:00:05Z');
    expect(policy.canIgnite(userId, last, now)).toBe(true);
  });

  it('allows ignition well after cooldown', () => {
    const last = new Date('2026-04-18T12:00:00Z');
    const now = new Date('2026-04-18T12:01:00Z');
    expect(policy.canIgnite(userId, last, now)).toBe(true);
  });

  it('respects custom cooldown value', () => {
    const shortPolicy = new FiveSecondCooldownPolicy(1000);
    const last = new Date('2026-04-18T12:00:00Z');
    const now = new Date('2026-04-18T12:00:00.999Z');
    expect(shortPolicy.canIgnite(userId, last, now)).toBe(false);
    const now2 = new Date('2026-04-18T12:00:01Z');
    expect(shortPolicy.canIgnite(userId, last, now2)).toBe(true);
  });

  it('cooldownMs=0 → always allows ignition even when lastIgnitionAt equals now', () => {
    const zeroPolicy = new FiveSecondCooldownPolicy(0);
    const now = new Date('2026-04-18T12:00:00Z');
    expect(zeroPolicy.canIgnite(token, now, now)).toBe(true);
  });

  it('same exact timestamp: lastIgnitionAt equals now with cooldown=5000 → blocked (0ms elapsed)', () => {
    const now = new Date('2026-04-18T12:00:00Z');
    expect(policy.canIgnite(token, now, now)).toBe(false);
  });
});
