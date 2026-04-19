/**
 * Calls `bus.shutdown()` if the bus exposes one. Used by SimulationModule and
 * WorkerModule for symmetric teardown of CommandBus/EventBus impls — InMemory
 * variants don't need shutdown, BullMQ variants do.
 */
export async function shutdownIfPossible(bus: unknown): Promise<void> {
  if (
    bus &&
    typeof bus === 'object' &&
    'shutdown' in bus &&
    typeof (bus as { shutdown?: unknown }).shutdown === 'function'
  ) {
    await (bus as { shutdown: () => Promise<void> }).shutdown();
  }
}
