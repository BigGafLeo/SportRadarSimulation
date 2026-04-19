export class EmailAlreadyExistsError extends Error {
  constructor(public readonly email: string) {
    super(`Email already registered: ${email}`);
    this.name = 'EmailAlreadyExistsError';
  }
}
