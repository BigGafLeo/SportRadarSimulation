import { Module } from '@nestjs/common';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { InMemoryOwnershipRepository } from '@ownership/infrastructure/in-memory-ownership.repository';
import { UuidOwnershipTokenGenerator } from '@ownership/infrastructure/uuid-ownership-token.generator';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';

@Module({
  providers: [
    { provide: PORT_TOKENS.OWNERSHIP_REPOSITORY, useClass: InMemoryOwnershipRepository },
    {
      provide: PORT_TOKENS.OWNERSHIP_TOKEN_GENERATOR,
      useFactory: (random: RandomProvider) => new UuidOwnershipTokenGenerator(random),
      inject: [PORT_TOKENS.RANDOM_PROVIDER],
    },
  ],
  exports: [PORT_TOKENS.OWNERSHIP_REPOSITORY, PORT_TOKENS.OWNERSHIP_TOKEN_GENERATOR],
})
export class OwnershipModule {}
