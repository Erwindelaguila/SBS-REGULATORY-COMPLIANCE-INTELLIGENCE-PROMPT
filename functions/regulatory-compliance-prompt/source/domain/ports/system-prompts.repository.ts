import { SystemPrompt } from "../models/supervisory-record.model";

export interface SystemPromptsRepository {
  getSystemPrompt(application: string, type: string): Promise<SystemPrompt[]>;
  
  // New method for WARRANTY to get prompts by specific promptType
  getSystemPromptByType(application: string, documentType: string, promptType: string): Promise<SystemPrompt[]>;
}
