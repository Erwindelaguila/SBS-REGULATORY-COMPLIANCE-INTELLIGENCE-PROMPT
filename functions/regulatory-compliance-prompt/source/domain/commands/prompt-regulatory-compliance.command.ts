export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class PromptRegulatoryComplianceCommand {
  private constructor(
    public readonly messageId: string,
    public readonly application: string,
    public readonly question: string,
    public readonly recordKeys: string[],
    public readonly conversationHistory: ConversationMessage[] = [],
  ) {}

  static createCommand(
    messageId: string,
    application: string,
    question: string,
    recordKeys: string[],
    conversationHistory: ConversationMessage[] = [],
  ): PromptRegulatoryComplianceCommand {
    return new PromptRegulatoryComplianceCommand(messageId, application, question, recordKeys, conversationHistory);
  }
}
