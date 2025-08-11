import { DynamoDBDocumentClient, UpdateCommand, UpdateCommandInput } from "@aws-sdk/lib-dynamodb";
import { SupervisoryRecordsRepository } from "../domain/ports/supervisory-records.repository";
import { Logger } from "pino";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

export class DynSupervisoryRecordsRepository implements SupervisoryRecordsRepository {
  constructor(
    private readonly dynamoDBDocumentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly logger: Logger,
  ) {}

  async updateMetadata(recordId: string, metadata: Record<string, any>): Promise<void> {
    try {
      this.logger.debug(`Updating metadata for record ${recordId} and metadata ${JSON.stringify(metadata)}`);
      const params: UpdateCommandInput = {
        TableName: this.tableName,
        Key: {
          id: recordId
        },
        UpdateExpression: "SET metadata = :metadata",
        ExpressionAttributeValues: {
          ":metadata": metadata
        },
        ReturnValues: "ALL_NEW"
      };
      const result = await this.dynamoDBDocumentClient.send(new UpdateCommand(params));
      this.logger.debug({ result }, "Successfully updated metadata");
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        this.logger.error({ err }, "Failed to update metadata");
      }
      this.logger.error({ err }, `Error updating metadata for record ${recordId}`);
      throw err;
    }
  }
}
