import { UserId } from '../value-objects/user-id';
import { Email } from '../value-objects/email';
import { HashedPassword } from '../value-objects/hashed-password';

export interface UserSnapshot {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly createdAt: Date;
}

export interface CreateUserInput {
  readonly id: UserId;
  readonly email: Email;
  readonly passwordHash: HashedPassword;
  readonly createdAt: Date;
}

export class User {
  private constructor(
    public readonly id: UserId,
    public readonly email: Email,
    public readonly passwordHash: HashedPassword,
    public readonly createdAt: Date,
  ) {}

  static create(input: CreateUserInput): User {
    return new User(input.id, input.email, input.passwordHash, input.createdAt);
  }

  static fromSnapshot(snapshot: UserSnapshot): User {
    return new User(
      UserId.create(snapshot.id),
      Email.create(snapshot.email),
      HashedPassword.fromHash(snapshot.passwordHash),
      new Date(snapshot.createdAt),
    );
  }

  toSnapshot(): UserSnapshot {
    return {
      id: this.id.value,
      email: this.email.value,
      passwordHash: this.passwordHash.value,
      createdAt: this.createdAt,
    };
  }
}
