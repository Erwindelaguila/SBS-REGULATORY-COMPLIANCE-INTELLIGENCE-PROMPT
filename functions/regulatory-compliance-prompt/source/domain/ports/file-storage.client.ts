export interface FileStorageClient {
  getFilesByKey(keys: string[]): Promise<FileData[]>;
  uploadFile(key: string, file: Uint8Array, contentType: string): Promise<void>;
}

type FileData = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
};
