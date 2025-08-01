import { Readable } from "stream";

export interface AIChatClient {
  getChatResponse(
    systemPrompt: string, 
    prompt: string,
    fileData: FileData[], 
  ): Promise<Readable>;
}

export type AIChatResponse = {
  response: string;
  fileKeys: string[];
}

export type FileData = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}