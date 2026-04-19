import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SimulationOrchestrator } from '@simulation/application/orchestrator/simulation-orchestrator';
import { SimulationId } from '@simulation/domain/value-objects/simulation-id';
import { JwtAuthGuard } from '@auth/infrastructure/security/jwt-auth.guard';
import { CurrentUser } from '@auth/infrastructure/security/current-user.decorator';
import { CreateSimulationRequestDto } from './dto/create-simulation.request';
import type { SimulationSnapshot } from '@simulation/domain/aggregates/simulation';
import type { AuthenticatedUser } from '@shared/auth/authenticated-user';

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

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateSimulationRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{
    simulationId: string;
    state: 'RUNNING';
    initialSnapshot: SimulationResponseShape;
  }> {
    const result = await this.orchestrator.startSimulation({
      userId: user.id,
      name: body.name,
      profileId: body.profile,
    });
    return {
      simulationId: result.simulationId,
      state: result.state,
      initialSnapshot: toResponse(result.initialSnapshot),
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/finish')
  @HttpCode(HttpStatus.ACCEPTED)
  async finish(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.orchestrator.finishSimulation({
      simulationId: SimulationId.create(id),
      userId: user.id,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/restart')
  @HttpCode(HttpStatus.ACCEPTED)
  async restart(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.orchestrator.restartSimulation({
      simulationId: SimulationId.create(id),
      userId: user.id,
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
