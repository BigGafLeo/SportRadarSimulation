import { Test } from '@nestjs/testing';
import { SimulationController } from '@simulation/infrastructure/consumer/http/simulation.controller';
import { SimulationOrchestrator } from '@simulation/application/orchestrator/simulation-orchestrator';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import type { SimulationSnapshot } from '@simulation/domain/aggregates/simulation';

describe('SimulationController', () => {
  const simId = '550e8400-e29b-41d4-a716-446655440000';
  const token = '550e8400-e29b-41d4-a716-446655440010';
  const snapshot: SimulationSnapshot = {
    id: simId,
    ownerToken: token,
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
    }).compile();
    return module.get(SimulationController);
  }

  it('POST /simulations without token issues new token', async () => {
    const started = {
      simulationId: simId,
      ownershipToken: token,
      state: 'RUNNING' as const,
      initialSnapshot: snapshot,
    };
    const ctrl = await buildControllerWith({
      startSimulation: jest.fn().mockResolvedValue(started),
    } as unknown as Partial<SimulationOrchestrator>);
    const result = await ctrl.create({ name: 'Katar 2023' } as never, undefined);
    expect(result.simulationId).toBe(simId);
    expect(result.ownershipToken).toBe(token);
  });

  it('POST /simulations forwards header token when present', async () => {
    const startSpy = jest.fn().mockResolvedValue({
      simulationId: simId,
      ownershipToken: token,
      state: 'RUNNING' as const,
      initialSnapshot: snapshot,
    });
    const ctrl = await buildControllerWith({
      startSimulation: startSpy,
    } as unknown as Partial<SimulationOrchestrator>);
    await ctrl.create({ name: 'Katar 2023' } as never, token);
    expect(startSpy).toHaveBeenCalledWith({
      name: 'Katar 2023',
      ownershipToken: expect.any(OwnershipToken),
    });
    const arg = startSpy.mock.calls[0][0];
    expect(arg.ownershipToken.value).toBe(token);
  });

  it('POST /simulations/:id/finish requires token header and forwards to orchestrator', async () => {
    const finishSpy = jest.fn().mockResolvedValue(undefined);
    const ctrl = await buildControllerWith({
      finishSimulation: finishSpy,
    } as unknown as Partial<SimulationOrchestrator>);
    await ctrl.finish(simId, token);
    expect(finishSpy).toHaveBeenCalledWith({
      simulationId: expect.any(SimulationId),
      ownershipToken: expect.any(OwnershipToken),
    });
  });

  it('POST /simulations/:id/restart requires token header', async () => {
    const restartSpy = jest.fn().mockResolvedValue(undefined);
    const ctrl = await buildControllerWith({
      restartSimulation: restartSpy,
    } as unknown as Partial<SimulationOrchestrator>);
    await ctrl.restart(simId, token);
    expect(restartSpy).toHaveBeenCalled();
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

  it('GET /simulations/:id returns single', async () => {
    const getSpy = jest.fn().mockResolvedValue(snapshot);
    const ctrl = await buildControllerWith({
      getSimulation: getSpy,
    } as unknown as Partial<SimulationOrchestrator>);
    const result = await ctrl.get(simId);
    expect(result.id).toBe(simId);
  });
});
