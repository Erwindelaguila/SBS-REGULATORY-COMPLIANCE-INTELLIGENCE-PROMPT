import { MetadataInsertionPromptCommandHandler } from "../domain/command-handlers/metadata-insertion-prompt.command-handler";
import { MetadataInsertionPromptCommand } from "../domain/commands/metadata-insertion-prompt.command";

type MetadataInsertionPromptInput = {
  recordId: string;
  fileKey: string;
  systemPrompt: string;
  userPrompt: string;
};

export class MetadataInsertionPromptEntryPoint {
  constructor (
    private readonly metadataInsertionPromptCommandHandler: MetadataInsertionPromptCommandHandler 
  ) {}

  public async handleRequest (metadataInsInput: MetadataInsertionPromptInput): Promise<void> {
    const command = MetadataInsertionPromptCommand.createCommand(
      metadataInsInput.recordId,
      metadataInsInput.fileKey,
      metadataInsInput.systemPrompt,
      metadataInsInput.userPrompt
    );

    await this.metadataInsertionPromptCommandHandler.handle(command);
  }
}  
