export interface FileStorageClient {
  getFileByKey(key: string, recordId: string): Promise<RecordFileData>
}

export type RecordFileData = {
  recordId: string;
  key: string;
  bytes: Uint8Array;
  contentType: string;
}