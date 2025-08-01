import { SystemPrompt } from "../models/supervisory-record.model";

export interface SystemPromptsRepository {
  getSystemPrompt(application: string, type: string): Promise<SystemPrompt[]>;
}
