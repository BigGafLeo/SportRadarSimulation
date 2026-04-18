import { randomInt, randomUUID } from 'node:crypto';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';

export class CryptoRandomProvider implements RandomProvider {
  int(min: number, max: number): number {
    return randomInt(min, max + 1);
  }

  uuid(): string {
    return randomUUID();
  }
}
