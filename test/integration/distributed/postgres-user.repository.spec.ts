import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@prisma/client';
import { PostgresUserRepository } from '@auth/infrastructure/persistence/postgres-user.repository';
import { User } from '@auth/domain/aggregates/user';
import { UserId } from '@auth/domain/value-objects/user-id';
import { Email } from '@auth/domain/value-objects/email';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';

describe('PostgresUserRepository (Testcontainers)', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let repo: PostgresUserRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test')
      .withUsername('test')
      .withPassword('test')
      .start();
    const url = container.getConnectionUri();
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'inherit',
    });
    prisma = new PrismaClient({ datasources: { db: { url } } });
    repo = new PostgresUserRepository(prisma);
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  }, 60_000);

  afterEach(async () => {
    await prisma.simulation.deleteMany();
    await prisma.user.deleteMany();
  });

  function makeUser(overrides: { id?: string; email?: string } = {}): User {
    return User.create({
      id: UserId.create(overrides.id ?? 'b0000000-0000-0000-0000-000000000001'),
      email: Email.create(overrides.email ?? 'test@example.com'),
      passwordHash: HashedPassword.fromHash('$argon2id$fakehash'),
      createdAt: new Date('2026-04-19T12:00:00Z'),
    });
  }

  it('saves and finds by email', async () => {
    await repo.save(makeUser());
    const found = await repo.findByEmail(Email.create('test@example.com'));
    expect(found).not.toBeNull();
    expect(found!.email.value).toBe('test@example.com');
  });

  it('saves and finds by id', async () => {
    const user = makeUser();
    await repo.save(user);
    const found = await repo.findById(user.id);
    expect(found).not.toBeNull();
    expect(found!.id.value).toBe(user.id.value);
  });

  it('returns null for unknown email', async () => {
    const found = await repo.findByEmail(Email.create('nobody@example.com'));
    expect(found).toBeNull();
  });

  it('returns null for unknown id', async () => {
    const found = await repo.findById(UserId.create('c0000000-0000-0000-0000-000000000009'));
    expect(found).toBeNull();
  });

  it('rejects duplicate email (DB UNIQUE constraint)', async () => {
    await repo.save(makeUser({ id: 'b0000000-0000-0000-0000-000000000001' }));
    const dup = makeUser({ id: 'b0000000-0000-0000-0000-000000000002' });
    await expect(repo.save(dup)).rejects.toThrow();
  });
});
