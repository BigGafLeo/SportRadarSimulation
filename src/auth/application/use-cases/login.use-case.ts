import { Email } from '@auth/domain/value-objects/email';
import { InvalidCredentialsError } from '@auth/domain/errors/invalid-credentials.error';
import type { UserRepository } from '@auth/domain/ports/user-repository.port';
import type { PasswordHasher } from '@auth/domain/ports/password-hasher.port';

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface LoginResult {
  readonly id: string;
  readonly email: string;
  readonly createdAt: Date;
}

export class LoginUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const email = Email.create(input.email);
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new InvalidCredentialsError();
    }

    const valid = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!valid) {
      throw new InvalidCredentialsError();
    }

    return { id: user.id.value, email: user.email.value, createdAt: user.createdAt };
  }
}
