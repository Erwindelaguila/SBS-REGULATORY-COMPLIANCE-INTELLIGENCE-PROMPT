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

  async updateProcessedKey(recordId: string, processedKey: string): Promise<void> {
    try {
      this.logger.debug(`Updating proccessedKey for record ${recordId}}`);
      const params: UpdateCommandInput = {
        TableName: this.tableName,
        Key: {
          id: recordId,
        },
        UpdateExpression: "SET #processedKey = :processedKey",
        ExpressionAttributeValues: {
          ":processedKey": processedKey,
        },
        ExpressionAttributeNames: {
          "#processedKey": "processedKey",
        },
        ReturnValues: "ALL_NEW",
      };
      const result = await this.dynamoDBDocumentClient.send(new UpdateCommand(params));
      this.logger.debug({ result }, "Successfully updated processedKey");
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        this.logger.error({ err }, "Failed to update processedKey");
      }
      this.logger.error({ err }, `Error updating processedKey for record ${recordId}`);
      throw err;
    }
  }
}
