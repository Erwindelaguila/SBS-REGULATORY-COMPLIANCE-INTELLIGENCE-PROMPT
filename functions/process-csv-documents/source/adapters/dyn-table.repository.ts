import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { Logger } from "pino";
import { TableRepository } from "../domain/ports/table.repository";
import { RepositoryError } from "../domain/errors/repository.error";
import { promisify } from "util";

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

    try {
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);

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

        await promisify(setTimeout)(5000);

        this.logger.debug({ inserted: batch.length, total: records.length }, "Batch inserted");
      }

      this.logger.info({ total: records.length, table: this.tableName }, "All records inserted successfully");
    } catch (error) {
      this.logger.error({ error, table: this.tableName }, "Failed to insert records");
      throw new RepositoryError("Failed to insert records to DynamoDB", error);
    }
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
