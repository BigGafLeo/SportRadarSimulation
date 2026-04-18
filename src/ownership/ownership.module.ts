import { Module } from '@nestjs/common';
import { PORT_TOKENS } from '@simulation/domain/ports/tokens';
import { InMemoryOwnershipRepository } from '@ownership/infrastructure/in-memory-ownership.repository';

@Module({
  providers: [{ provide: PORT_TOKENS.OWNERSHIP_REPOSITORY, useClass: InMemoryOwnershipRepository }],
  exports: [PORT_TOKENS.OWNERSHIP_REPOSITORY],
})
export class OwnershipModule {}
