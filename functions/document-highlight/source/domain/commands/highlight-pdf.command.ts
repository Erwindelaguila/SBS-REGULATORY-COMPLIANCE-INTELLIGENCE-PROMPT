export class HighlightPdfCommand {
  private constructor(
    public readonly recordKey: string,
    public readonly messageId: string,
    public readonly index: number,
  ) {}

  static createCommand(commandInput: { recordKey: string; messageId: string; index: number }): HighlightPdfCommand {
    return new HighlightPdfCommand(commandInput.recordKey, commandInput.messageId, commandInput.index);
  }
}
