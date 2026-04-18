import { APP_FILTER } from '@nestjs/core';
import { Module, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '@shared/config/config.schema';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { OwnershipModule } from '@ownership/ownership.module';
import { SystemClock } from '@simulation/infrastructure/time/system-clock';
import { CryptoRandomProvider } from '@simulation/infrastructure/random/crypto-random-provider';
import { InMemorySimulationRepository } from '@simulation/infrastructure/persistence/in-memory-simulation.repository';
import { UniformRandomGoalDynamics } from '@simulation/infrastructure/dynamics/uniform-random-goal-dynamics';
import { TickingSimulationEngine } from '@simulation/infrastructure/engine/ticking-simulation-engine';
import { FiveSecondCooldownPolicy } from '@simulation/infrastructure/policies/five-second-cooldown.policy';
import { TtlRetentionPolicy } from '@simulation/infrastructure/policies/ttl-retention.policy';
import { InMemoryCommandBus } from '@shared/messaging/in-memory-command-bus';
import { InMemoryEventBus } from '@shared/messaging/in-memory-event-bus';
import { InMemoryEventPublisher } from '@shared/messaging/in-memory-event-publisher';
import { SimulationOrchestrator } from '@simulation/application/orchestrator/simulation-orchestrator';
import { SimulationWorkerHandler } from '@simulation/application/worker/simulation-worker.handler';
import { SimulationController } from '@simulation/infrastructure/consumer/http/simulation.controller';
import { DomainExceptionFilter } from '@simulation/infrastructure/consumer/http/domain-exception.filter';
import { SimulationGateway } from '@simulation/infrastructure/consumer/ws/simulation.gateway';
import { WsEventForwarder } from '@simulation/infrastructure/consumer/ws/ws-event-forwarder';
import type { SimulationConfig } from '@simulation/domain/simulation-config';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';
import type { Clock } from '@simulation/domain/ports/clock.port';
import type { MatchDynamics } from '@simulation/domain/ports/match-dynamics.port';
import type { SimulationRepository } from '@simulation/domain/ports/simulation-repository.port';
import type { EventPublisher } from '@simulation/domain/ports/event-publisher.port';
import type { SimulationEngine } from '@simulation/domain/ports/simulation-engine.port';
import type { CommandBus } from '@shared/messaging/command-bus.port';
import type { EventBus } from '@shared/messaging/event-bus.port';
import type { OwnershipRepository } from '@ownership/domain/ports/ownership-repository.port';
import type { OwnershipTokenGenerator } from '@ownership/domain/ports/ownership-token-generator.port';
import type { ThrottlePolicy } from '@simulation/domain/ports/throttle-policy.port';

const DEFAULT_PROFILE_ID = 'default';

function configFromEnv(config: ConfigService<AppConfig, true>): SimulationConfig {
  return {
    durationMs: config.get('SIMULATION_DURATION_MS', { infer: true }),
    goalIntervalMs: config.get('GOAL_INTERVAL_MS', { infer: true }),
    goalCount: config.get('GOAL_COUNT', { infer: true }),
    firstGoalOffsetMs: config.get('FIRST_GOAL_OFFSET_MS', { infer: true }),
    startCooldownMs: config.get('START_COOLDOWN_MS', { infer: true }),
  };
}

interface GatewayWithServer {
  server: { to(room: string): { emit(event: string, payload: unknown): void } };
}

@Module({
  imports: [OwnershipModule],
  controllers: [SimulationController],
  providers: [
    { provide: PORT_TOKENS.CLOCK, useClass: SystemClock },
    { provide: PORT_TOKENS.RANDOM_PROVIDER, useClass: CryptoRandomProvider },
    { provide: PORT_TOKENS.SIMULATION_REPOSITORY, useClass: InMemorySimulationRepository },
    { provide: PORT_TOKENS.COMMAND_BUS, useClass: InMemoryCommandBus },
    { provide: PORT_TOKENS.EVENT_BUS, useClass: InMemoryEventBus },
    {
      provide: PORT_TOKENS.EVENT_PUBLISHER,
      useFactory: (bus: EventBus) => new InMemoryEventPublisher(bus),
      inject: [PORT_TOKENS.EVENT_BUS],
    },
    {
      provide: PORT_TOKENS.MATCH_DYNAMICS,
      useFactory: (random: RandomProvider, config: ConfigService<AppConfig, true>) =>
        new UniformRandomGoalDynamics(random, configFromEnv(config)),
      inject: [PORT_TOKENS.RANDOM_PROVIDER, ConfigService],
    },
    {
      provide: PORT_TOKENS.SIMULATION_ENGINE,
      useFactory: (clock: Clock, dynamics: MatchDynamics) =>
        new TickingSimulationEngine(clock, dynamics),
      inject: [PORT_TOKENS.CLOCK, PORT_TOKENS.MATCH_DYNAMICS],
    },
    {
      provide: PORT_TOKENS.THROTTLE_POLICY,
      useFactory: (config: ConfigService<AppConfig, true>) =>
        new FiveSecondCooldownPolicy(config.get('START_COOLDOWN_MS', { infer: true })),
      inject: [ConfigService],
    },
    {
      provide: PORT_TOKENS.RETENTION_POLICY,
      useFactory: (config: ConfigService<AppConfig, true>) =>
        new TtlRetentionPolicy(config.get('FINISHED_RETENTION_MS', { infer: true })),
      inject: [ConfigService],
    },
    {
      provide: SimulationOrchestrator,
      useFactory: (
        simRepo: SimulationRepository,
        ownerRepo: OwnershipRepository,
        tokenGen: OwnershipTokenGenerator,
        throttle: ThrottlePolicy,
        cmdBus: CommandBus,
        publisher: EventPublisher,
        clock: Clock,
        config: ConfigService<AppConfig, true>,
      ) =>
        new SimulationOrchestrator({
          simulationRepository: simRepo,
          ownershipRepository: ownerRepo,
          tokenGenerator: tokenGen,
          throttlePolicy: throttle,
          commandBus: cmdBus,
          eventPublisher: publisher,
          clock,
          config: configFromEnv(config),
          defaultProfileId: DEFAULT_PROFILE_ID,
        }),
      inject: [
        PORT_TOKENS.SIMULATION_REPOSITORY,
        PORT_TOKENS.OWNERSHIP_REPOSITORY,
        PORT_TOKENS.OWNERSHIP_TOKEN_GENERATOR,
        PORT_TOKENS.THROTTLE_POLICY,
        PORT_TOKENS.COMMAND_BUS,
        PORT_TOKENS.EVENT_PUBLISHER,
        PORT_TOKENS.CLOCK,
        ConfigService,
      ],
    },
    {
      provide: SimulationWorkerHandler,
      useFactory: (
        simRepo: SimulationRepository,
        cmdBus: CommandBus,
        publisher: EventPublisher,
        engine: SimulationEngine,
        clock: Clock,
      ) =>
        new SimulationWorkerHandler({
          simulationRepository: simRepo,
          commandBus: cmdBus,
          eventPublisher: publisher,
          engine,
          clock,
          profileId: DEFAULT_PROFILE_ID,
        }),
      inject: [
        PORT_TOKENS.SIMULATION_REPOSITORY,
        PORT_TOKENS.COMMAND_BUS,
        PORT_TOKENS.EVENT_PUBLISHER,
        PORT_TOKENS.SIMULATION_ENGINE,
        PORT_TOKENS.CLOCK,
      ],
    },
    SimulationGateway,
    {
      provide: WsEventForwarder,
      useFactory: (bus: EventBus, gateway: SimulationGateway) =>
        new WsEventForwarder(bus, () => (gateway as unknown as GatewayWithServer).server),
      inject: [PORT_TOKENS.EVENT_BUS, SimulationGateway],
    },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
  exports: [SimulationOrchestrator, SimulationWorkerHandler, WsEventForwarder, SimulationGateway],
})
export class SimulationModule implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly worker: SimulationWorkerHandler,
    private readonly forwarder: WsEventForwarder,
  ) {}

  onModuleInit(): void {
    this.worker.subscribe();
    this.forwarder.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.shutdown();
    await this.forwarder.stop();
  }
}
