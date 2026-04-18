import { UuidOwnershipTokenGenerator } from '@ownership/infrastructure/uuid-ownership-token.generator';
import { SeededRandomProvider } from '@simulation/infrastructure/random/seeded-random-provider';
import { CryptoRandomProvider } from '@simulation/infrastructure/random/crypto-random-provider';

describe('UuidOwnershipTokenGenerator', () => {
  it('produces OwnershipToken wrapping a UUID v4', () => {
    const gen = new UuidOwnershipTokenGenerator(new CryptoRandomProvider());
    const token = gen.generate();
    expect(token.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('different calls return distinct tokens', () => {
    const gen = new UuidOwnershipTokenGenerator(new CryptoRandomProvider());
    expect(gen.generate().value).not.toBe(gen.generate().value);
  });

  it('using SeededRandomProvider makes generate deterministic', () => {
    const a = new UuidOwnershipTokenGenerator(new SeededRandomProvider(42));
    const b = new UuidOwnershipTokenGenerator(new SeededRandomProvider(42));
    expect(a.generate().value).toBe(b.generate().value);
  });
});
