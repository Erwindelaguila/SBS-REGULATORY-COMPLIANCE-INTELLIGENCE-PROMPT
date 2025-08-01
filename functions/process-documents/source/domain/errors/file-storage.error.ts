export class FileStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileStorageError";
  }
}
