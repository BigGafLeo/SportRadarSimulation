import { randomUUID } from 'crypto';
import { User } from '@auth/domain/aggregates/user';
import { UserId } from '@auth/domain/value-objects/user-id';
import { Email } from '@auth/domain/value-objects/email';
import { EmailAlreadyExistsError } from '@auth/domain/errors/email-already-exists.error';
import type { UserRepository } from '@auth/domain/ports/user-repository.port';
import type { PasswordHasher } from '@auth/domain/ports/password-hasher.port';

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
}

export interface RegisterResult {
  readonly id: string;
  readonly email: string;
  readonly createdAt: Date;
}

export class RegisterUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async execute(input: RegisterInput): Promise<RegisterResult> {
    const email = Email.create(input.email);
    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new EmailAlreadyExistsError(email.value);
    }

    const id = UserId.create(randomUUID());
    const passwordHash = await this.passwordHasher.hash(input.password);
    const now = new Date();

    const user = User.create({ id, email, passwordHash, createdAt: now });
    await this.userRepository.save(user);

    return { id: user.id.value, email: user.email.value, createdAt: user.createdAt };
  }
}
