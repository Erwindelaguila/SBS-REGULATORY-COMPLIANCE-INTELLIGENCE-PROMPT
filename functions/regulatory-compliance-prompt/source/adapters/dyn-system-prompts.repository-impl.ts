import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SystemPrompt } from "../domain/models/supervisory-record.model";
import { SystemPromptsRepository } from "../domain/ports/system-prompts.repository";
import { Logger } from "pino";

export class DynSystemPromptsRepositoryImpl implements SystemPromptsRepository {
  constructor(
    private readonly dynamoDBDocumentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly logger: Logger,
  ) {}
  
  async getSystemPrompt(application: string, type: string): Promise<SystemPrompt[]> {
    try {
      const queryResult = await this.dynamoDBDocumentClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: "application-documentType-index",
          KeyConditionExpression: " #application = :application AND #documentType = :documentType ",
          ExpressionAttributeValues: {
            ":documentType": type,
            ":application": application,
            ":promptType": "CHAT",
          },
          ExpressionAttributeNames: {
            "#application": "application",
            "#documentType": "documentType",
            "#promptType": "promptType",
          },
          FilterExpression: "#promptType = :promptType",
        }),
      );
      return (queryResult?.Items ?? []) as SystemPrompt[];
    } catch (err) {
      // TODO: Handle specific DynamoDB errors
      if (err instanceof Error) {
        this.logger.error({ err }, "Failed to get system prompts");
      }
      throw err;
    }
  }
}
