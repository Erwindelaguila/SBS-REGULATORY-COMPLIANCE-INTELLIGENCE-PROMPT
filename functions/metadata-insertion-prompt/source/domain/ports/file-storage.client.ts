export interface FileStorageClient {
  getFileByKey(key: string): Promise<FileData>
}

export type FileData = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}