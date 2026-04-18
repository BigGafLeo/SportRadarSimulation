import { randomInt, randomUUID } from 'node:crypto';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';

const FLOAT_DIVISOR = 0x1_0000_0000; // 2^32

export class CryptoRandomProvider implements RandomProvider {
  int(min: number, max: number): number {
    return randomInt(min, max + 1);
  }

  float(): number {
    return randomInt(0, FLOAT_DIVISOR) / FLOAT_DIVISOR;
  }

  uuid(): string {
    return randomUUID();
  }
}
