import { Application } from "../model/application";
import { DocumentType } from "../model/document-type";
import { PromptType } from "../model/prompt-type";
import { SystemPrompt } from "../model/system-prompt";

export interface SystemPromptsRepository {
  getSystemPromptByApplicationAndDocumentTypeAndPromptType(
    application: Application,
    documentType: DocumentType,
    promptType: PromptType,
  ): Promise<SystemPrompt>;
}
