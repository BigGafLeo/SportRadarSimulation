import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { SimulationOrchestrator } from '@simulation/application/orchestrator/simulation-orchestrator';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import { CreateSimulationRequestDto } from './dto/create-simulation.request';
import type { SimulationSnapshot } from '@simulation/domain/aggregates/simulation';
import { SIMULATION_TOKEN_HEADER } from './simulation-token.header';

interface SimulationResponseShape {
  id: string;
  name: string;
  state: 'RUNNING' | 'FINISHED';
  score: readonly { matchId: string; home: number; away: number }[];
  totalGoals: number;
  startedAt: string;
  finishedAt: string | null;
  profileId: string;
}

function toResponse(snap: SimulationSnapshot): SimulationResponseShape {
  return {
    id: snap.id,
    name: snap.name,
    state: snap.state,
    score: snap.score,
    totalGoals: snap.totalGoals,
    startedAt: snap.startedAt.toISOString(),
    finishedAt: snap.finishedAt ? snap.finishedAt.toISOString() : null,
    profileId: snap.profileId,
  };
}

@Controller('simulations')
export class SimulationController {
  constructor(private readonly orchestrator: SimulationOrchestrator) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateSimulationRequestDto,
    @Headers(SIMULATION_TOKEN_HEADER) token?: string,
  ): Promise<{
    simulationId: string;
    ownershipToken: string;
    state: 'RUNNING';
    initialSnapshot: SimulationResponseShape;
  }> {
    const ownershipToken = token ? OwnershipToken.create(token) : undefined;
    const result = await this.orchestrator.startSimulation({
      name: body.name,
      ownershipToken,
      profileId: body.profile,
    });
    return {
      simulationId: result.simulationId,
      ownershipToken: result.ownershipToken,
      state: result.state,
      initialSnapshot: toResponse(result.initialSnapshot),
    };
  }

  @Post(':id/finish')
  @HttpCode(HttpStatus.ACCEPTED)
  async finish(
    @Param('id') id: string,
    @Headers(SIMULATION_TOKEN_HEADER) token: string | undefined,
  ): Promise<void> {
    if (!token) throw new UnauthorizedException(`Missing ${SIMULATION_TOKEN_HEADER} header`);
    await this.orchestrator.finishSimulation({
      simulationId: SimulationId.create(id),
      ownershipToken: OwnershipToken.create(token),
    });
  }

  @Post(':id/restart')
  @HttpCode(HttpStatus.ACCEPTED)
  async restart(
    @Param('id') id: string,
    @Headers(SIMULATION_TOKEN_HEADER) token: string | undefined,
  ): Promise<void> {
    if (!token) throw new UnauthorizedException(`Missing ${SIMULATION_TOKEN_HEADER} header`);
    await this.orchestrator.restartSimulation({
      simulationId: SimulationId.create(id),
      ownershipToken: OwnershipToken.create(token),
    });
  }

  @Get()
  async list(): Promise<SimulationResponseShape[]> {
    const all = await this.orchestrator.listSimulations();
    return all.map(toResponse);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<SimulationResponseShape> {
    const snap = await this.orchestrator.getSimulation(SimulationId.create(id));
    return toResponse(snap);
  }
}
