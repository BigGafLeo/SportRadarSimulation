describe('sanity', () => {
  it('jest wires up and runs TS', () => {
    expect(1 + 1).toBe(2);
  });

  it('can import from src via path alias', async () => {
    const mod = await import('@simulation/domain/ports/tokens');
    expect(mod.PORT_TOKENS.CLOCK).toBeDefined();
  });
});
