import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { AppConfig } from '@shared/config/config.schema';
import { AUTH_GUARD } from '@shared/auth/auth.constants';
import { AUTH_PORT_TOKENS } from './domain/ports/tokens';
import { RegisterUseCase } from './application/use-cases/register.use-case';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { JwtStrategy } from './infrastructure/security/jwt.strategy';
import { JwtAuthGuard } from './infrastructure/security/jwt-auth.guard';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher';
import { createUserRepository } from './infrastructure/persistence/user-repository.factory';
import { AuthController } from './infrastructure/consumer/http/auth.controller';
import type { UserRepository } from './domain/ports/user-repository.port';
import type { PasswordHasher } from './domain/ports/password-hasher.port';

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
    JwtAuthGuard,
    { provide: AUTH_GUARD, useClass: JwtAuthGuard },
    { provide: AUTH_PORT_TOKENS.PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    {
      provide: AUTH_PORT_TOKENS.USER_REPOSITORY,
      useFactory: (config: ConfigService<AppConfig, true>) => createUserRepository(config),
      inject: [ConfigService],
    },
    {
      provide: RegisterUseCase,
      useFactory: (repo: UserRepository, hasher: PasswordHasher) =>
        new RegisterUseCase(repo, hasher),
      inject: [AUTH_PORT_TOKENS.USER_REPOSITORY, AUTH_PORT_TOKENS.PASSWORD_HASHER],
    },
    {
      provide: LoginUseCase,
      useFactory: (repo: UserRepository, hasher: PasswordHasher) => new LoginUseCase(repo, hasher),
      inject: [AUTH_PORT_TOKENS.USER_REPOSITORY, AUTH_PORT_TOKENS.PASSWORD_HASHER],
    },
  ],
  exports: [AUTH_GUARD, JwtAuthGuard, JwtStrategy],
})
export class AuthModule {}
