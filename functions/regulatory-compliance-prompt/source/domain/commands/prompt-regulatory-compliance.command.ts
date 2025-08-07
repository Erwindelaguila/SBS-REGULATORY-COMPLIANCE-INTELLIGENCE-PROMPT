export class PromptRegulatoryComplianceCommand {
  private constructor (
    public readonly question: string,
    public readonly recordKeys: string[]
  ) {}

  static createCommand (
    question: string,
    recordKeys: string[]
  ): PromptRegulatoryComplianceCommand {
    return new PromptRegulatoryComplianceCommand(question, recordKeys);
  }
}