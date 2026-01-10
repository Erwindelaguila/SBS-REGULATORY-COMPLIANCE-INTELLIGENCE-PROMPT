import { Readable } from "stream";
import { PromptRegulatoryComplianceCommandHandler } from "../domain/command-handlers/prompt-regulatory-compliance.command-handler";
import { PromptRegulatoryComplianceCommand, ConversationMessage } from "../domain/commands/prompt-regulatory-compliance.command";

type PromptRegComplInput = {
  messageId: string;
  application: string;
  question: string;
  recordKeys: string[];
  conversationHistory?: ConversationMessage[];
};

type PromptRegComplOutPut = {
  result: Readable;
  fileKeys: string[];
  isDocumentGenerated?: boolean;  // Flag to indicate if a document was generated
  documentType?: 'WARRANTY' | 'LETTER' | 'SUBORDINATED_DEBT';  // Type of document generated
};

export class PromptRegulatoryComplianceEntrypoint {
  constructor(private readonly promptRegulatoryComplianceCommandHandler: PromptRegulatoryComplianceCommandHandler) {}

  public async handleRequest(promptRegComplInput: PromptRegComplInput): Promise<PromptRegComplOutPut> {
    const command = PromptRegulatoryComplianceCommand.createCommand(
      promptRegComplInput.messageId,
      promptRegComplInput.application,
      promptRegComplInput.question,
      promptRegComplInput.recordKeys,
      promptRegComplInput.conversationHistory || [],
    );

    const result = await this.promptRegulatoryComplianceCommandHandler.handle(command);

    return result;
  }
}
