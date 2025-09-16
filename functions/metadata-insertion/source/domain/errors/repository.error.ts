export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}

export class RecordNotFoundError extends RepositoryError {
  constructor(message: string) {
    super(message);
  }
}
