import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '@shared/config/config.schema';
import { SimulationOrchestrator } from '@simulation/application/orchestrator/simulation-orchestrator';
import { PROFILE_IDS } from '@simulation/infrastructure/profiles/profile-registry';
import { SIMULATION_TOPICS } from '@simulation/application/commands/simulation-topics';

interface QueueStats {
  readonly counts: Record<string, number>;
  readonly workerCount: number;
  readonly workers: Array<{ id: string; addr: string; age: number; name: string }>;
}

@Controller('admin')
export class AdminController {
  constructor(
    private readonly orchestrator: SimulationOrchestrator,
    @Inject(ConfigService) private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get('stats')
  async stats(): Promise<{
    mode: { transport: string; persistence: string };
    simulations: {
      running: number;
      finished: number;
      list: Array<{
        id: string;
        name: string;
        state: string;
        profileId: string;
        totalGoals: number;
        startedAt: string;
      }>;
    };
    queues: Record<string, QueueStats>;
    timestamp: string;
  }> {
    const transport = this.config.get('TRANSPORT_MODE', { infer: true });
    const persistence = this.config.get('PERSISTENCE_MODE', { infer: true });
    const simulations = await this.orchestrator.listSimulations();
    const queues = transport === 'bullmq' ? await this.collectQueueStats() : {};
    return {
      mode: { transport, persistence },
      simulations: {
        running: simulations.filter((s) => s.state === 'RUNNING').length,
        finished: simulations.filter((s) => s.state === 'FINISHED').length,
        list: simulations.map((s) => ({
          id: s.id,
          name: s.name,
          state: s.state,
          profileId: s.profileId,
          totalGoals: s.totalGoals,
          startedAt: s.startedAt.toISOString(),
        })),
      },
      queues,
      timestamp: new Date().toISOString(),
    };
  }

  private async collectQueueStats(): Promise<Record<string, QueueStats>> {
    const redisUrl = this.config.get('REDIS_URL', { infer: true });
    const parsed = new URL(redisUrl);
    const connection = { host: parsed.hostname, port: Number(parsed.port || 6379) };
    const { Queue } = await import('bullmq');
    const names = [
      ...PROFILE_IDS.map((id) => SIMULATION_TOPICS.RUN(id)),
      SIMULATION_TOPICS.ABORT,
      'simulation.events',
    ];
    const result: Record<string, QueueStats> = {};
    for (const name of names) {
      const q = new Queue(name, { connection });
      const counts = (await q.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      )) as Record<string, number>;
      const workers = await q.getWorkers();
      result[name] = {
        counts,
        workerCount: workers.length,
        workers: workers.map((w) => ({
          id: String(w.id ?? ''),
          addr: String(w.addr ?? ''),
          age: Number(w.age ?? 0),
          name: String(w.name ?? ''),
        })),
      };
      await q.close();
    }
    return result;
  }
}
