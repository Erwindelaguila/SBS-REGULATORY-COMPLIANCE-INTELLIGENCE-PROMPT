import { DynamoDBRecord } from "aws-lambda";

export class MetadataInsertionPromptCommand {
  private constructor (
    public readonly insertRecords: DynamoDBRecord[],
    public readonly systemPrompt: string,
    public readonly userPrompt: string,
  ) {}

  static createCommand (
    insertRecords: DynamoDBRecord[],
    systemPrompt: string,
    userPrompt: string,
  ): MetadataInsertionPromptCommand {
    return new MetadataInsertionPromptCommand(insertRecords, systemPrompt, userPrompt);
  }
} 