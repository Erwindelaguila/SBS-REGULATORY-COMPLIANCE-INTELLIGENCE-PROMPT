export class HighlightPdfCommand {
  private constructor(
    public readonly uuid: string,
    public readonly paragraph: string,
    public readonly pageNumber: number
  ) {}

  static createCommand(commandInput: { 
    uuid: string; 
    paragraph: string; 
    pageNumber: number 
  }): HighlightPdfCommand {
    if (!commandInput.uuid) {
      throw new Error("UUID is required");
    }
    
    if (!commandInput.paragraph || commandInput.paragraph.trim().length === 0) {
      throw new Error("Paragraph text is required");
    }
    
    if (!commandInput.pageNumber || commandInput.pageNumber < 1) {
      throw new Error("Valid page number is required");
    }
    
    return new HighlightPdfCommand(
      commandInput.uuid,
      commandInput.paragraph.trim(),
      commandInput.pageNumber
    );
  }
}