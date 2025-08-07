export interface FileStorageClient {
  getFilesByKey(keys: string[]): Promise<FileData[]>
}

type FileData = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}