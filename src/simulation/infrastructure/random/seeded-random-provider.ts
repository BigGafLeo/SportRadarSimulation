import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';

/**
 * Linear Congruential Generator (Numerical Recipes parameters).
 * Not cryptographically secure; suitable for deterministic tests only.
 */
export class SeededRandomProvider implements RandomProvider {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  int(min: number, max: number): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    const range = max - min + 1;
    return min + (this.state % range);
  }

  float(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x1_0000_0000;
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

  private nextHex(digits: number): string {
    let out = '';
    while (out.length < digits) {
      this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
      out += this.state.toString(16).padStart(8, '0');
    }
    return out.slice(0, digits);
  }

  private variantNibble(): string {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    const variantBits = 0x8 | (this.state & 0x3);
    return variantBits.toString(16);
  }
}
