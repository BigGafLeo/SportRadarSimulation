import { InMemoryOwnershipRepository } from '@ownership/infrastructure/in-memory-ownership.repository';
import { OwnershipToken } from '@ownership/domain/value-objects/ownership-token';

describe('InMemoryOwnershipRepository', () => {
  const tokenStr = '550e8400-e29b-41d4-a716-446655440010';
  const token = OwnershipToken.create(tokenStr);

  it('findByToken returns null when not saved', async () => {
    const repo = new InMemoryOwnershipRepository();
    const r = await repo.findByToken(token);
    expect(r).toBeNull();
  });

  it('save + findByToken round-trip', async () => {
    const repo = new InMemoryOwnershipRepository();
    const createdAt = new Date('2026-04-18T10:00:00Z');
    await repo.save({ token, createdAt, lastIgnitionAt: null });
    const r = await repo.findByToken(token);
    expect(r?.token.value).toBe(tokenStr);
    expect(r?.createdAt).toEqual(createdAt);
    expect(r?.lastIgnitionAt).toBeNull();
  });

  it('updateLastIgnitionAt updates the stored timestamp', async () => {
    const repo = new InMemoryOwnershipRepository();
    await repo.save({ token, createdAt: new Date(0), lastIgnitionAt: null });
    const ignitionAt = new Date('2026-04-18T10:00:00Z');
    await repo.updateLastIgnitionAt(token, ignitionAt);
    const r = await repo.findByToken(token);
    expect(r?.lastIgnitionAt).toEqual(ignitionAt);
  });

  it('updateLastIgnitionAt throws if token unknown', async () => {
    const repo = new InMemoryOwnershipRepository();
    await expect(repo.updateLastIgnitionAt(token, new Date())).rejects.toThrow();
  });
});
