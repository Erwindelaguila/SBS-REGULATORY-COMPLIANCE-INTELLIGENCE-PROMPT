import { DynamoDBDocumentClient, QueryCommand, QueryCommandOutput } from "@aws-sdk/lib-dynamodb";
import { Application } from "../domain/model/application";
import { DocumentType } from "../domain/model/document-type";
import { SystemPrompt } from "../domain/model/system-prompt";
import { SystemPromptsRepository } from "../domain/ports/system-prompts-repository";
import { Logger } from "pino";
import { RecordNotFoundError, RepositoryError } from "../domain/errors/repository.error";
import { PromptType } from "../domain/model/prompt-type";

export class DynSystemPromptsRepository implements SystemPromptsRepository {
  constructor(
    private readonly dynamoDBDocumentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly logger: Logger,
  ) {}

  async getSystemPromptByApplicationAndDocumentTypeAndPromptType(
    application: Application,
    documentType: DocumentType,
    promptType: PromptType,
  ): Promise<SystemPrompt> {
    let queryCommandOutput: QueryCommandOutput;
    this.logger.info({ application, documentType, promptType }, "Retreiving SystemPrompts");

    try {
      queryCommandOutput = await this.dynamoDBDocumentClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: "application-documentType-index",
          KeyConditionExpression: "#application = :application and #documentType = :documentType",
          ExpressionAttributeNames: {
            "#application": "application",
            "#documentType": "documentType",
            "#promptType": "promptType",
          },
          ExpressionAttributeValues: {
            ":application": application,
            ":documentType": documentType,
            ":promptType": promptType,
          },
          Limit: 1,
          FilterExpression: "#promptType = :promptType",
        }),
      );
    } catch (error) {
      this.logger.error(error, `An error has ocurred retrieving records`);
      throw new RepositoryError("And error has ocurred retreiving record");
    }

    if (queryCommandOutput.Items === undefined || queryCommandOutput.Count === 0) {
      this.logger.error("Records not found");
      throw new RecordNotFoundError(`System prompt not found`);
    }

    return {
      id: queryCommandOutput.Items[0].id,
      version: queryCommandOutput.Items[0].version,
      prompt: queryCommandOutput.Items[0].prompt,
      application: queryCommandOutput.Items[0].application,
      promptType: queryCommandOutput.Items[0].promptType,
      documentType: queryCommandOutput.Items[0].documentType,
    };
  }
}
