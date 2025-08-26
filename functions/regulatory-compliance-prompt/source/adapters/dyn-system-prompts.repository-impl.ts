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
          IndexName: "application-type-index",
          KeyConditionExpression: " #application = :application AND #type = :type",
          ExpressionAttributeValues: {
            ":type": type,
            ":application": application,
          },
          ExpressionAttributeNames: {
            "#application": "application",
            "#type": "type",
          },
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
