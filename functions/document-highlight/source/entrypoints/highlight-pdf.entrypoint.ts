import { HighlightPdfCommandHandler } from "../domain/command-handlers/highlight-pdf.command-handler";
import { HighlightPdfCommand } from "../domain/commands/highlight-pdf.command";

type HighlightPdfInput = {
  recordKey: string;
  messageId: string;
  index: number;
};

type HighlightPdfOutput = {
  downloadName: string;
  buffer: Buffer;
};

export class HighlightPdfEntryPoint {
  constructor(private readonly highlightPdfCommandHandler: HighlightPdfCommandHandler) {}

  async handleRequest(highlightPdfInput: HighlightPdfInput): Promise<HighlightPdfOutput> {
    const highlightPdfCommand = HighlightPdfCommand.createCommand({
      recordKey: highlightPdfInput.recordKey,
      messageId: highlightPdfInput.messageId,
      index: highlightPdfInput.index,
    });

    const result = await this.highlightPdfCommandHandler.execute(highlightPdfCommand);

    return {
      downloadName: result.downloadName,
      buffer: result.buffer,
    };
  }
}
