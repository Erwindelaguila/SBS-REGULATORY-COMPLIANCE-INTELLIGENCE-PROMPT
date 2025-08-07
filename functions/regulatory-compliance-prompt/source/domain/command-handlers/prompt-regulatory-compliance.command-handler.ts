import { Logger } from "pino";
import { AIChatClient } from "../ports/ai-chat.client";
import { FileStorageClient } from "../ports/file-storage.client";
import { SystemPromptsRepository } from "../ports/system-prompts.repository";
import { PromptRegulatoryComplianceCommand } from "../commands/prompt-regulatory-compliance.command";
import { Readable } from "stream";

export interface PromptRegComplCommandHandlerOutput {
  result: Readable;
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
      const SYSTEM_PROMPT = "You are a language model that must respond strictly in Markdown format using two sections: \"### File Responses\" and \"### General Response\".\n\n1. In the \"File Responses\" section, include one subsection per file using the format:\n#### File: {fileName}\n- **Sender**: sender name or 'Not found in file'\n- **Receiver**: receiver name or 'Not found in file'\n- **Subject**: subject text or 'Not found in file'\n- **Response**: answer to the specific question asked about the file\n\n2. In the \"General Response\" section, provide a general answer or conclusion based on all uploaded files.\n\nDo not output anything outside of the Markdown structure. Use headers and bullet points clearly. If sender, receiver, or subject cannot be found, always return 'Not found in file'. Keep your format consistent. fileName must not include the file extension";

     
      // Get files by keys
      const filesData = await this.fileStorageClient.getFilesByKey(command.recordKeys); 

      // Get AI chat response
      const aiResponse = await this.aiChatClient.getChatResponse(
        SYSTEM_PROMPT,
        command.question,
        filesData,
      );

      return {
        result: aiResponse,
        fileKeys: command.recordKeys, // Assuming we return the same keys as part of the response
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