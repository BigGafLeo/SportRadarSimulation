import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';

// Numerical Recipes LCG parameters — deterministic 32-bit pseudo-random sequence.
const LCG_MULTIPLIER = 1664525;
const LCG_INCREMENT = 1013904223;
const UINT32_MOD = 0x1_0000_0000;

/**
 * Linear Congruential Generator. Not cryptographically secure;
 * suitable for deterministic tests only.
 */
export class SeededRandomProvider implements RandomProvider {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  int(min: number, max: number): number {
    this.step();
    const range = max - min + 1;
    return min + (this.state % range);
  }

  float(): number {
    this.step();
    return this.state / UINT32_MOD;
  }

  uuid(): string {
    const parts = [
      this.nextHex(8),
      this.nextHex(4),
      '4' + this.nextHex(3),
      this.variantNibble() + this.nextHex(3),
      this.nextHex(12),
    ];
    return parts.join('-');
  }

  private step(): void {
    this.state = (Math.imul(this.state, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
  }

  private nextHex(digits: number): string {
    let out = '';
    while (out.length < digits) {
      this.step();
      out += this.state.toString(16).padStart(8, '0');
    }
    return out.slice(0, digits);
  }

  private variantNibble(): string {
    this.step();
    const variantBits = 0x8 | (this.state & 0x3);
    return variantBits.toString(16);
  }
}
