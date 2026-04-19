import { Module, type OnModuleInit, type OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '@shared/config/config.schema';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { CryptoRandomProvider } from '@simulation/infrastructure/random/crypto-random-provider';
import { TickingSimulationEngine } from '@simulation/infrastructure/engine/ticking-simulation-engine';
import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';
import { getProfile } from '@simulation/infrastructure/profiles/profile-registry';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { Clock } from '@simulation/domain/ports/clock.port';
import type { MatchDynamics } from '@simulation/domain/ports/match-dynamics.port';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { EventPublisher } from '@simulation/domain/ports/event-publisher.port';
import type { SimulationEngine } from '@simulation/domain/ports/simulation-engine.port';
import type { CommandBus } from '@shared/messaging/command-bus.port';
import type { EventBus } from '@shared/messaging/event-bus.port';

async function shutdownIfPossible(bus: unknown): Promise<void> {
  if (
    bus &&
    typeof bus === 'object' &&
    'shutdown' in bus &&
    typeof (bus as { shutdown?: unknown }).shutdown === 'function'
  ) {
    await (bus as { shutdown: () => Promise<void> }).shutdown();
  }
}

@Module({
  providers: [
    { provide: PORT_TOKENS.RANDOM_PROVIDER, useClass: CryptoRandomProvider },
    {
      provide: PORT_TOKENS.CLOCK,
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const profileId = config.get('SIMULATION_PROFILE', { infer: true });
        return getProfile(profileId).clockFactory();
      },
      inject: [ConfigService],
    },
    {
      provide: PORT_TOKENS.MATCH_DYNAMICS,
      useFactory: (random: RandomProvider, config: ConfigService<AppConfig, true>) => {
        const profileId = config.get('SIMULATION_PROFILE', { infer: true });
        return getProfile(profileId).dynamicsFactory({ random });
      },
      inject: [PORT_TOKENS.RANDOM_PROVIDER, ConfigService],
    },
    {
      provide: PORT_TOKENS.SIMULATION_REPOSITORY,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const { createRedisClient } = await import('../shared/infrastructure/redis.client');
        const { RedisSimulationRepository } =
          await import('../simulation/infrastructure/persistence/redis-simulation.repository');
        const { PRESET_MATCHES } =
          await import('../simulation/domain/value-objects/matches-preset');
        const client = createRedisClient(config.get('REDIS_URL', { infer: true }));
        await client.connect();
        return new RedisSimulationRepository(client, PRESET_MATCHES);
      },
      inject: [ConfigService],
    },
    {
      provide: PORT_TOKENS.COMMAND_BUS,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const { BullMQCommandBus } = await import('../shared/messaging/bullmq-command-bus');
        return new BullMQCommandBus(config.get('REDIS_URL', { infer: true }));
      },
      inject: [ConfigService],
    },
    {
      provide: PORT_TOKENS.EVENT_BUS,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const { BullMQEventBus } = await import('../shared/messaging/bullmq-event-bus');
        return new BullMQEventBus(config.get('REDIS_URL', { infer: true }));
      },
      inject: [ConfigService],
    },
    {
      provide: PORT_TOKENS.EVENT_PUBLISHER,
      useFactory: async (bus: EventBus) => {
        const { InMemoryEventPublisher } =
          await import('../shared/messaging/in-memory-event-publisher');
        return new InMemoryEventPublisher(bus);
      },
      inject: [PORT_TOKENS.EVENT_BUS],
    },
    {
      provide: PORT_TOKENS.SIMULATION_ENGINE,
      useFactory: (clock: Clock, dynamics: MatchDynamics) =>
        new TickingSimulationEngine(clock, dynamics),
      inject: [PORT_TOKENS.CLOCK, PORT_TOKENS.MATCH_DYNAMICS],
    },
    {
      provide: SimulationWorkerHandler,
      useFactory: (
        simRepo: SimulationRepository,
        cmdBus: CommandBus,
        publisher: EventPublisher,
        engine: SimulationEngine,
        clock: Clock,
        config: ConfigService<AppConfig, true>,
      ) =>
        new SimulationWorkerHandler({
          simulationRepository: simRepo,
          commandBus: cmdBus,
          eventPublisher: publisher,
          engine,
          clock,
          profileId: config.get('SIMULATION_PROFILE', { infer: true }),
        }),
      inject: [
        PORT_TOKENS.SIMULATION_REPOSITORY,
        PORT_TOKENS.COMMAND_BUS,
        PORT_TOKENS.EVENT_PUBLISHER,
        PORT_TOKENS.SIMULATION_ENGINE,
        PORT_TOKENS.CLOCK,
        ConfigService,
      ],
    },
  ],
  exports: [SimulationWorkerHandler, PORT_TOKENS.COMMAND_BUS, PORT_TOKENS.EVENT_BUS],
})
export class WorkerModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly worker: SimulationWorkerHandler,
    @Inject(PORT_TOKENS.COMMAND_BUS) private readonly commandBus: CommandBus,
    @Inject(PORT_TOKENS.EVENT_BUS) private readonly eventBus: EventBus,
  ) {}

  onModuleInit(): void {
    this.worker.subscribe();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.shutdown();
    await shutdownIfPossible(this.commandBus);
    await shutdownIfPossible(this.eventBus);
  }
}
