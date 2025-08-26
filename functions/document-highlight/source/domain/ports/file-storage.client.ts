export interface FileStorageClient {
  getObjectByKey(key: string): Promise<Buffer>;
}
