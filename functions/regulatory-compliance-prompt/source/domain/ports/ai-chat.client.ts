export interface AIChatClient {
  getChatResponse(
    systemPrompt: string, 
    prompt: string,
    filesBytes?: Uint8Array[], 
  ): Promise<AIChatResponse>;
}

export type AIChatResponse = {
  response: string;
  fileKeys: string[];
}