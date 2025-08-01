import { RecordFileData } from "../model/record-file-data";

export interface AIChatClient {
  generateMetadata(systemPrompt: string, userPrompt: string, filesData: RecordFileData[]): Promise<RecordMetadata[]>;
}

export type RecordMetadata = {
  recordId: string;
  metadata: Record<string, any>;
};
