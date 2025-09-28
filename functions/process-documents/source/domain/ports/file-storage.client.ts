export interface FileStorageClient {
  getFileByKey(key: string): Promise<FileData>;
  saveFile(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

export type FileData = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
};
