import { Readable } from "stream";

export interface AIChatClient {
  getChatResponse(
    systemPrompt: string, 
    prompt: string,
    filesBytes?: Uint8Array[], 
  ): Promise<Readable>;
}

export type AIChatResponse = {
  response: string;
  fileKeys: string[];
}