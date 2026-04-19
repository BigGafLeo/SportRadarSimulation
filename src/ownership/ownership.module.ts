import { Module } from '@nestjs/common';
import { InMemoryOwnershipRepository } from '@ownership/infrastructure/in-memory-ownership.repository';

export const OWNERSHIP_REPOSITORY_TOKEN = Symbol('OwnershipRepository');

@Module({
  providers: [{ provide: OWNERSHIP_REPOSITORY_TOKEN, useClass: InMemoryOwnershipRepository }],
  exports: [OWNERSHIP_REPOSITORY_TOKEN],
})
export class OwnershipModule {}
