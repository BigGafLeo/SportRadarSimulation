export class HashedPassword {
  private constructor(public readonly value: string) {}

  static fromHash(hash: string): HashedPassword {
    if (!hash) {
      throw new Error('HashedPassword: hash cannot be empty');
    }
    return new HashedPassword(hash);
  }
}
