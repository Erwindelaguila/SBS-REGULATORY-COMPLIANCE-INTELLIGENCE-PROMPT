export type MetadataInsertionPromptCommandRecord = {
  recordId: string;
  parentId: string;
  key: string;
  metadata: Record<string, any>;
  sessionId: string;
};

export class MetadataInsertionPromptCommand {
  private constructor(
    public readonly records: MetadataInsertionPromptCommandRecord[],
    public readonly systemPrompt: string,
    public readonly userPrompt: string,
  ) {}

  static createCommand(
    records: MetadataInsertionPromptCommandRecord[],
    systemPrompt: string,
    userPrompt: string,
  ): MetadataInsertionPromptCommand {
    return new MetadataInsertionPromptCommand(records, systemPrompt, userPrompt);
  }
}
