/**
 * Time abstraction port.
 * Default impl: SystemClock (Phase 1b). Test impl: FakeClock with advance(ms).
 */
export interface Clock {
  now(): Date;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
