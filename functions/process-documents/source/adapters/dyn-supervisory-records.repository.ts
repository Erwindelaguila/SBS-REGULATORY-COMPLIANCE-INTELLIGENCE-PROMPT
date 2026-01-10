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

  async updateRecord(
    supervisedEntityId: string,
    recordId: string,
    updates: { analysisStarted?: string; analysisFinished?: string }
  ): Promise<void> {
    try {
      const updateExpressions: string[] = [];
      const expressionAttributeValues: Record<string, any> = {};
      const expressionAttributeNames: Record<string, string> = {};

      if (updates.analysisStarted) {
        updateExpressions.push("#analysisStarted = :analysisStarted");
        expressionAttributeValues[":analysisStarted"] = updates.analysisStarted;
        expressionAttributeNames["#analysisStarted"] = "analysisStarted";
      }

      if (updates.analysisFinished) {
        updateExpressions.push("#analysisFinished = :analysisFinished");
        expressionAttributeValues[":analysisFinished"] = updates.analysisFinished;
        expressionAttributeNames["#analysisFinished"] = "analysisFinished";
      }

      if (updateExpressions.length === 0) {
        this.logger.debug("No updates to perform");
        return;
      }

      const params: UpdateCommandInput = {
        TableName: this.tableName,
        Key: {
          id: recordId,
        },
        UpdateExpression: `SET ${updateExpressions.join(", ")}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: expressionAttributeNames,
        ReturnValues: "ALL_NEW",
      };

      const result = await this.dynamoDBDocumentClient.send(new UpdateCommand(params));
      this.logger.debug({ result, updates }, "Successfully updated record analysis timestamps");
    } catch (err) {
      this.logger.error({ err }, `Error updating analysis timestamps for record ${recordId}`);
      throw err;
    }
  }
}
