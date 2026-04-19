import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { AppConfig } from '@shared/config/config.schema';
import { AUTH_GUARD } from '@shared/auth/auth.constants';
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { JwtStrategy } from './infrastructure/security/jwt.strategy';
import { JwtAuthGuard } from './infrastructure/security/jwt-auth.guard';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher';
import { AuthController } from './infrastructure/consumer/http/auth.controller';
import type { UserRepository } from './domain/ports/user-repository.port';
import type { PasswordHasher } from './domain/ports/password-hasher.port';

const USER_REPOSITORY = Symbol('UserRepository');
const PASSWORD_HASHER = Symbol('PasswordHasher');

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: config.get('JWT_EXPIRES_IN', { infer: true }) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    {
      provide: JwtStrategy,
      useFactory: (config: ConfigService<AppConfig, true>) =>
        new JwtStrategy(config.get('JWT_SECRET', { infer: true })),
      inject: [ConfigService],
    },
    { provide: AUTH_GUARD, useClass: JwtAuthGuard },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    {
      provide: USER_REPOSITORY,
      useFactory: async (config: ConfigService<AppConfig, true>) => {
        const mode = config.get('PERSISTENCE_MODE', { infer: true });
        if (mode === 'postgres') {
          const { getPrismaClient } = await import('../shared/infrastructure/prisma.client');
          const { PostgresUserRepository } =
            await import('./infrastructure/persistence/postgres-user.repository');
          const prisma = getPrismaClient(config.get('DATABASE_URL', { infer: true }));
          return new PostgresUserRepository(prisma);
        }
        const { InMemoryUserRepository } =
          await import('./infrastructure/persistence/in-memory-user.repository');
        return new InMemoryUserRepository();
      },
      inject: [ConfigService],
    },
    {
      provide: RegisterUseCase,
      useFactory: (repo: UserRepository, hasher: PasswordHasher) =>
        new RegisterUseCase(repo, hasher),
      inject: [USER_REPOSITORY, PASSWORD_HASHER],
    },
    {
      provide: LoginUseCase,
      useFactory: (repo: UserRepository, hasher: PasswordHasher) => new LoginUseCase(repo, hasher),
      inject: [USER_REPOSITORY, PASSWORD_HASHER],
    },
    {
      provide: AuthController,
      useFactory: (
        register: RegisterUseCase,
        login: LoginUseCase,
        jwtService: JwtService,
        repo: UserRepository,
      ) => new AuthController(register, login, jwtService, repo),
      inject: [RegisterUseCase, LoginUseCase, JwtService, USER_REPOSITORY],
    },
  ],
  exports: [AUTH_GUARD, JwtAuthGuard, JwtStrategy],
})
export class AuthModule {}
