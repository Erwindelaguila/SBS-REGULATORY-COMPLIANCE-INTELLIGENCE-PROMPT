import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { WriteRequest } from "@aws-sdk/client-dynamodb";
import { Logger } from "pino";
import { TableRepository } from "../domain/ports/table.repository";
import { RepositoryError } from "../domain/errors/repository.error";

export class DynTableRepository implements TableRepository {
  private readonly BATCH_SIZE = 25;
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_RETRY_DELAY_MS = 1000;

  constructor(
    private readonly dynamoDBDocumentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly logger: Logger,
    private readonly batchDelayMs: number = 100, // Configurable delay between batches
  ) { }

  async insertRecords(records: Record<string, any>[]): Promise<void> {
    if (records.length === 0) {
      this.logger.info("No records to insert");
      return;
    }

    const totalBatches = Math.ceil(records.length / this.BATCH_SIZE);
    let successfulBatches = 0;
    let failedBatches = 0;

    this.logger.info(
      { total: records.length, batches: totalBatches, table: this.tableName },
      "Starting batch insertion"
    );

    for (let i = 0; i < records.length; i += this.BATCH_SIZE) {
      const batch = records.slice(i, i + this.BATCH_SIZE);
      const batchNumber = Math.floor(i / this.BATCH_SIZE) + 1;

      try {
        await this.insertBatchWithRetry(batch, batchNumber);
        successfulBatches++;

        // Add delay between batches to avoid throttling
        if (i + this.BATCH_SIZE < records.length) {
          await this.sleep(this.batchDelayMs);
        }
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
          "Failed to insert batch after all retries"
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

  private async insertBatchWithRetry(
    batch: Record<string, any>[],
    batchNumber: number
  ): Promise<void> {
    let unprocessedItems: WriteRequest[] = batch.map((record) => ({
      PutRequest: {
        Item: this.convertToDecimal(record),
      },
    }));

    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      if (unprocessedItems.length === 0) {
        return;
      }

      try {
        const response = await this.dynamoDBDocumentClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [this.tableName]: unprocessedItems,
            },
          })
        );

        // Check for unprocessed items
        if (response.UnprocessedItems && response.UnprocessedItems[this.tableName]) {
          unprocessedItems = response.UnprocessedItems[this.tableName];

          if (attempt < this.MAX_RETRIES) {
            const delay = this.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
            this.logger.warn(
              {
                batchNumber,
                attempt: attempt + 1,
                unprocessedCount: unprocessedItems.length,
                delayMs: delay,
                table: this.tableName,
              },
              "Retrying unprocessed items"
            );
            await this.sleep(delay);
          } else {
            throw new Error(
              `Failed to process ${unprocessedItems.length} items after ${this.MAX_RETRIES} retries`
            );
          }
        } else {
          // All items processed successfully
          return;
        }
      } catch (error: any) {
        if (attempt < this.MAX_RETRIES) {
          const delay = this.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          this.logger.warn(
            {
              error,
              batchNumber,
              attempt: attempt + 1,
              delayMs: delay,
              table: this.tableName,
            },
            "Batch write failed, retrying with exponential backoff"
          );
          await this.sleep(delay);
        } else {
          throw error;
        }
      }
    }

    throw new Error(`Failed to insert batch ${batchNumber} after ${this.MAX_RETRIES} retries`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
