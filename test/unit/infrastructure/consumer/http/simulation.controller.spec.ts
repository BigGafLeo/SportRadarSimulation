import { Test } from '@nestjs/testing';
import { SimulationController } from '@simulation/infrastructure/consumer/http/simulation.controller';
import { SimulationOrchestrator } from '@simulation/application/orchestrator/simulation-orchestrator';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import type { SimulationSnapshot } from '@simulation/domain/aggregates/simulation';
import type { AuthenticatedUser } from '@shared/auth/authenticated-user';

describe('SimulationController', () => {
  const simId = '550e8400-e29b-41d4-a716-446655440000';
  const userId = 'user-uuid-0001';
  const user: AuthenticatedUser = { id: userId, email: 'test@example.com' };

  const snapshot: SimulationSnapshot = {
    id: simId,
    ownerId: userId,
    name: 'Katar 2023',
    state: 'RUNNING',
    score: [],
    totalGoals: 0,
    startedAt: new Date('2026-04-18T12:00:00Z'),
    finishedAt: null,
    profileId: 'default',
  };

  async function buildControllerWith(orchestratorMock: Partial<SimulationOrchestrator>) {
    const module = await Test.createTestingModule({
      controllers: [SimulationController],
      providers: [{ provide: SimulationOrchestrator, useValue: orchestratorMock }],
    })
      .overrideGuard((await import('@auth/infrastructure/security/jwt-auth.guard')).JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    return module.get(SimulationController);
  }

  it('POST /simulations calls startSimulation with userId from JWT user', async () => {
    const started = {
      simulationId: simId,
      state: 'RUNNING' as const,
      initialSnapshot: snapshot,
    };
    const startSpy = jest.fn().mockResolvedValue(started);
    const ctrl = await buildControllerWith({
      startSimulation: startSpy,
    } as unknown as Partial<SimulationOrchestrator>);
    const result = await ctrl.create({ name: 'Katar 2023' } as never, user);
    expect(startSpy).toHaveBeenCalledWith({
      userId,
      name: 'Katar 2023',
      profileId: undefined,
    });
    expect(result.simulationId).toBe(simId);
    expect(result.state).toBe('RUNNING');
    expect('ownershipToken' in result).toBe(false);
  });

  it('POST /simulations/:id/finish calls finishSimulation with userId and simulationId', async () => {
    const finishSpy = jest.fn().mockResolvedValue(undefined);
    const ctrl = await buildControllerWith({
      finishSimulation: finishSpy,
    } as unknown as Partial<SimulationOrchestrator>);
    await ctrl.finish(simId, user);
    expect(finishSpy).toHaveBeenCalledWith({
      simulationId: expect.any(SimulationId),
      userId,
    });
  });

  it('POST /simulations/:id/restart calls restartSimulation with userId and simulationId', async () => {
    const restartSpy = jest.fn().mockResolvedValue(undefined);
    const ctrl = await buildControllerWith({
      restartSimulation: restartSpy,
    } as unknown as Partial<SimulationOrchestrator>);
    await ctrl.restart(simId, user);
    expect(restartSpy).toHaveBeenCalledWith({
      simulationId: expect.any(SimulationId),
      userId,
    });
  });

  it('GET /simulations returns orchestrator.listSimulations snapshot list', async () => {
    const listSpy = jest.fn().mockResolvedValue([snapshot]);
    const ctrl = await buildControllerWith({
      listSimulations: listSpy,
    } as unknown as Partial<SimulationOrchestrator>);
    const result = await ctrl.list();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(simId);
    expect(result[0].startedAt).toBe('2026-04-18T12:00:00.000Z');
  });

  it('GET /simulations/:id returns single simulation snapshot', async () => {
    const getSpy = jest.fn().mockResolvedValue(snapshot);
    const ctrl = await buildControllerWith({
      getSimulation: getSpy,
    } as unknown as Partial<SimulationOrchestrator>);
    const result = await ctrl.get(simId);
    expect(result.id).toBe(simId);
  });
});
