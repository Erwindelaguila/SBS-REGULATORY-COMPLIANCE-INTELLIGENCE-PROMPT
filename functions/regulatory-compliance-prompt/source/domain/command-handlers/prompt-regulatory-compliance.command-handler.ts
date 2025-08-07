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
      const SYSTEM_PROMPT = "You must respond strictly in JSON format with two main fields: \"fileResponses\" and \"generalResponse\".\n\n1. The \"fileResponses\" field is an array of objects, where each object represents the information processed from an individual uploaded file. Each object must have the following structure:\n{\n  \"fileName\": \"Name of the file without the extension\",\n  \"sender\": \"Sender extracted from the file or 'Not found in file'\",\n  \"receiver\": \"Receiver extracted from the file or 'Not found in file'\",\n  \"subject\": \"Subject extracted from the file or 'Not found in file'\",\n  \"response\": \"Answer to the question asked for this file\"\n}\n\n2. The \"generalResponse\" field must be a string that provides an overall answer or conclusion based on all the uploaded files.\n\nDo not include any additional explanation or output outside the JSON format. If the sender, receiver, or subject cannot be found in the file content, return exactly: \"Not found in file\". Your response must strictly follow this structure.";
     
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