import { HighlightPdfCommandHandler } from "../domain/command-handlers/highlight-pdf.command-handler";
import { HighlightPdfCommand } from "../domain/commands/highlight-pdf.command";

type HighlightPdfInput = {
  uuid: string;
  paragraph: string;
  pageNumber: number;
};

type HighlightPdfOutput = {
  downloadName: string;
  buffer: Buffer;
};

export class HighlightPdfEntryPoint {
  constructor(private readonly highlightPdfCommandHandler: HighlightPdfCommandHandler) {}

  async handleRequest(highlightPdfInput: HighlightPdfInput): Promise<HighlightPdfOutput> {
    const highlightPdfCommand = HighlightPdfCommand.createCommand({
      uuid: highlightPdfInput.uuid,
      paragraph: highlightPdfInput.paragraph,
      pageNumber: highlightPdfInput.pageNumber
    });
    
    const result = await this.highlightPdfCommandHandler.execute(highlightPdfCommand);
    
    return {
      downloadName: result.downloadName,
      buffer: result.buffer
    };
  }
}