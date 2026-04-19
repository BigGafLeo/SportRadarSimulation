import { Email } from '@auth/domain/value-objects/email';
import { HashedPassword } from '@auth/domain/value-objects/hashed-password';
import { InvalidCredentialsError } from '@auth/domain/errors/invalid-credentials.error';
import type { UserRepository } from '@auth/domain/ports/user-repository.port';
import type { PasswordHasher } from '@auth/domain/ports/password-hasher.port';

// Dummy hash used when email is not found to prevent timing side-channel
const DUMMY_HASH = HashedPassword.fromHash(
  '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
);

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

    const hashToVerify = user?.passwordHash ?? DUMMY_HASH;
    const valid = await this.passwordHasher.verify(input.password, hashToVerify);

    if (!user || !valid) {
      throw new InvalidCredentialsError();
    }

    return { id: user.id.value, email: user.email.value, createdAt: user.createdAt };
  }
}
