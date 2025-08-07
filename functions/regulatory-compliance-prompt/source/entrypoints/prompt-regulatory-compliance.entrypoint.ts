import { Readable } from "stream";
import { PromptRegulatoryComplianceCommandHandler } from "../domain/command-handlers/prompt-regulatory-compliance.command-handler";
import { PromptRegulatoryComplianceCommand } from "../domain/commands/prompt-regulatory-compliance.command";

type PromptRegComplInput = {
  question: string;
  recordKeys: string[];
}

type PromptRegComplOutPut = {
  result: Readable;
  fileKeys: string[];
}

export class PromptRegulatoryComplianceEntrypoint {
  constructor (
    private readonly promptRegulatoryComplianceCommandHandler: PromptRegulatoryComplianceCommandHandler
  ) {}

  public async handleRequest (
    promptRegComplInput: PromptRegComplInput
  ): Promise<PromptRegComplOutPut> {
    const command = PromptRegulatoryComplianceCommand.createCommand(
      promptRegComplInput.question,
      promptRegComplInput.recordKeys
    );

    const result = await this.promptRegulatoryComplianceCommandHandler.handle(command);

    return result;
  }
}