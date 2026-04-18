/**
 * Randomness abstraction port.
 * Default impl: CryptoRandomProvider (Phase 1b). Test impl: SeededRandom(seed).
 */
export interface RandomProvider {
  int(min: number, max: number): number;
  uuid(): string;
}
