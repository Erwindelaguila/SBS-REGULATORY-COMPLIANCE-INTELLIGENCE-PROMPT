export interface FileStorageClient {
  getFilesByKey(keys: string[]): Promise<Uint8Array[]>
}