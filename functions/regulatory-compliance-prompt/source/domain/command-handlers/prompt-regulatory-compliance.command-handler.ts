import { Logger } from "pino";
import { AIChatClient } from "../ports/ai-chat.client";
import { FileStorageClient } from "../ports/file-storage.client";
import { SystemPromptsRepository } from "../ports/system-prompts.repository";
import { PromptRegulatoryComplianceCommand } from "../commands/prompt-regulatory-compliance.command";

export interface PromptRegComplCommandHandlerOutput {
  answer: string;
  fileKeys: string[];
}

export class PromptRegulatoryComplianceCommandHandler {
  constructor (
    private readonly fileStorageClient: FileStorageClient,
    private readonly systemPromptsRepository: SystemPromptsRepository,
    private readonly aiChatClient: AIChatClient,
    private readonly logger: Logger,
  ) {}

  async handle (
    command: PromptRegulatoryComplianceCommand
  ): Promise<PromptRegComplCommandHandlerOutput> {
    try {
      /* // Get system prompts
      const systemPrompts = await this.systemPromptsRepository.getSystemPrompt();
      if (systemPrompts.length === 0) {
        throw new Error("No system prompts found");
      }
      const systemPrompt = systemPrompts[0].prompt; // Assuming we take the first prompt
      */
     
      // Get files by keys
      const filesBytes = await this.fileStorageClient.getFilesByKey(command.recordKeys); 

      // Get AI chat response
      const aiResponse = await this.aiChatClient.getChatResponse(
        "You are an expert in finance",
        command.question,
        filesBytes,
      );

      return {
        answer: aiResponse.response,
        fileKeys: aiResponse.fileKeys,
      };
    } catch (err) {
      // TODO: Handle specific errors and their codes
      if (err instanceof Error) {
        this.logger.error({ err }, "Failed to handle PromptRegulatoryComplianceCommand");
      }
      throw err;
    }
  }
}