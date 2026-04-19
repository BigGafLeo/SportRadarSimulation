import { CreateSimulationRequestSchema } from '@simulation/infrastructure/consumer/http/dto/create-simulation.request';

describe('CreateSimulationRequest', () => {
  it('accepts request without profile (defaults to uniform-realtime)', () => {
    const r = CreateSimulationRequestSchema.parse({ name: 'Katar 2023' });
    expect(r.profile).toBe('uniform-realtime');
  });

  it('accepts each known profile', () => {
    for (const p of ['uniform-realtime', 'poisson-accelerated', 'fast-markov']) {
      const r = CreateSimulationRequestSchema.parse({ name: 'Katar 2023', profile: p });
      expect(r.profile).toBe(p);
    }
  });

  it('rejects unknown profile', () => {
    expect(() =>
      CreateSimulationRequestSchema.parse({ name: 'Katar 2023', profile: 'nonsense' }),
    ).toThrow();
  });
});
