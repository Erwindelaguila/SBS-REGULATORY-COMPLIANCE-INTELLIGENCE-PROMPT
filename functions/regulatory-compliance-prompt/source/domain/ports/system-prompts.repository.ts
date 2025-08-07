import { SystemPrompt } from "../models/supervisory-record.model";

export interface SystemPromptsRepository {
  getSystemPrompt(): Promise<SystemPrompt[]>;
}