export class FileStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileStorageError";
  }
}

export class NotFoundError extends FileStorageError {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
