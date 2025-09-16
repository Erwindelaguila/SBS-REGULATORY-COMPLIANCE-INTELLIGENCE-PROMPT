export interface AIChatClient {
  generateMetadata(systemPrompt: string, userPrompt: string, filesData: RecordData[]): Promise<RecordMetadata[]>;
}

export type RecordData = {
  recordId: string;
  key: string;
  bytes: Uint8Array;
  contentType: string;
};

export type RecordMetadata = {
  recordId: string;
  metadata: Record<string, any>;
};
