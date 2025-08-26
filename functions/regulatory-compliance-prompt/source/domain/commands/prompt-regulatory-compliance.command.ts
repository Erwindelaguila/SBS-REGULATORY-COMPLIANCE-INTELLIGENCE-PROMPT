export class PromptRegulatoryComplianceCommand {
  private constructor(
    public readonly messageId: string,
    public readonly application: string,
    public readonly type: string,
    public readonly question: string,
    public readonly recordKeys: string[],
  ) {}

  static createCommand(
    messageId: string,
    application: string,
    type: string,
    question: string,
    recordKeys: string[],
  ): PromptRegulatoryComplianceCommand {
    return new PromptRegulatoryComplianceCommand(messageId, application, type, question, recordKeys);
  }
}
