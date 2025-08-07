import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { SystemPrompt } from "../domain/models/supervisory-record.model";
import { SystemPromptsRepository } from "../domain/ports/system-prompts.repository";
import { Logger } from "pino";

export class DynSystemPromptsRepositoryImpl implements SystemPromptsRepository {
  constructor(
    private readonly dynamoDBDocumentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly logger: Logger
  ) {

  }
  async getSystemPrompt(): Promise<SystemPrompt[]> {
    try {
      const queryResult = await this.dynamoDBDocumentClient.send(new QueryCommand({
        TableName: this.tableName,
        IndexName: "type-index",
        KeyConditionExpression: "type = :type",
        ExpressionAttributeValues: {
          ":type": "SYSTEM_PROMPT"
        }
      }))
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