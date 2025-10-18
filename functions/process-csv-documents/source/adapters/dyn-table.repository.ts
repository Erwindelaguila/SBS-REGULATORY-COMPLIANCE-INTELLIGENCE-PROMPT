import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { Logger } from "pino";
import { TableRepository } from "../domain/ports/table.repository";
import { RepositoryError } from "../domain/errors/repository.error";

export class DynTableRepository implements TableRepository {
  constructor(
    private readonly dynamoDBDocumentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly logger: Logger,
  ) {}

  async insertRecords(records: Record<string, any>[]): Promise<void> {
    if (records.length === 0) {
      this.logger.info("No records to insert");
      return;
    }

    const BATCH_SIZE = 25;
    const totalBatches = Math.ceil(records.length / BATCH_SIZE);
    let successfulBatches = 0;
    let failedBatches = 0;

    this.logger.info(
      { total: records.length, batches: totalBatches, table: this.tableName },
      "Starting batch insertion"
    );

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      try {
        const putRequests = batch.map((record) => ({
          PutRequest: {
            Item: this.convertToDecimal(record),
          },
        }));

        await this.dynamoDBDocumentClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [this.tableName]: putRequests,
            },
          }),
        );

        successfulBatches++;
      } catch (error) {
        failedBatches++;
        this.logger.error(
          {
            error,
            batchNumber,
            batchSize: batch.length,
            startIndex: i,
            endIndex: i + batch.length - 1,
            table: this.tableName,
          },
          "Failed to insert batch"
        );
      }
    }

    if (failedBatches > 0) {
      this.logger.error(
        {
          total: records.length,
          successful: successfulBatches,
          failed: failedBatches,
          table: this.tableName,
        },
        "Batch insertion completed with errors"
      );
      throw new RepositoryError(
        `Failed to insert ${failedBatches} out of ${totalBatches} batches to DynamoDB`
      );
    }

    this.logger.info(
      { total: records.length, batches: totalBatches, table: this.tableName },
      "All records inserted successfully"
    );
  }

  private convertToDecimal(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === "number") {
        result[key] = value;
      } else if (typeof value === "object" && !Array.isArray(value)) {
        result[key] = this.convertToDecimal(value);
      } else if (Array.isArray(value)) {
        result[key] = value.map((item) => (typeof item === "object" ? this.convertToDecimal(item) : item));
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}
