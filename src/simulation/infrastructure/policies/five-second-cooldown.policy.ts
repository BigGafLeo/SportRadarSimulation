import type { ThrottlePolicy } from '@simulation/domain/ports/throttle-policy.port';

export class FiveSecondCooldownPolicy implements ThrottlePolicy {
  /**
   * @param cooldownMs defaults to 5000ms per PDF requirement #3
   */
  constructor(private readonly cooldownMs: number = 5000) {}

  canIgnite(_userId: string, lastIgnitionAt: Date | null, now: Date): boolean {
    if (lastIgnitionAt === null) return true;
    return now.getTime() - lastIgnitionAt.getTime() >= this.cooldownMs;
  }
}
