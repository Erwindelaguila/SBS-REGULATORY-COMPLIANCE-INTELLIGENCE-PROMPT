
export interface AIChatClient {
  generateMetadata(
    systemPrompt: string, 
    userPrompt: string,
    filesData: FileData[], 
  ): Promise<Record<string, any>>;
}

export type FileData = {
  recordId: string,
  key: string;
  bytes: Uint8Array;
  contentType: string;
}