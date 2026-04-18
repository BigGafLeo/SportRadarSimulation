import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';
import type { OwnershipTokenGenerator } from '@ownership/domain/ports/ownership-token-generator.port';
import type { RandomProvider } from '@simulation/domain/ports/random-provider.port';

export class UuidOwnershipTokenGenerator implements OwnershipTokenGenerator {
  constructor(private readonly random: RandomProvider) {}

  generate(): OwnershipToken {
    return OwnershipToken.create(this.random.uuid());
  }
}
