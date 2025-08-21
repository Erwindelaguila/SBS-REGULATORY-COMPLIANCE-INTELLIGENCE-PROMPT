export interface AIChatClient {
  generateMetadata(systemPrompt: string, userPrompt: string, filesData: FileData[]): Promise<FileMetadata[]>;
}

export type FileData = {
  recordId: string;
  key: string;
  bytes: Uint8Array;
  contentType: string;
};

export type FileMetadata = {
  recordId: string;
  metadata: Record<string, any>;
};
