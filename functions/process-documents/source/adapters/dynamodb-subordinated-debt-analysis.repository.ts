import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { Logger } from "pino";
import {
  SubordinatedDebtAnalysisRepository,
  SubordinatedDebtAnalysisResult,
} from "../domain/ports/subordinated-debt-analysis.repository";

export class DynamoDBSubordinatedDebtAnalysisRepository implements SubordinatedDebtAnalysisRepository {
  constructor(
    private readonly dynamoDBClient: DynamoDBClient,
    private readonly tableName: string,
    private readonly logger: Logger,
  ) {}

  async saveAnalysisResult(result: SubordinatedDebtAnalysisResult): Promise<void> {
    try {
      const command = new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(result),
      });

      await this.dynamoDBClient.send(command);
      this.logger.info({ source: result.source, type: result.type }, "Saved subordinated debt analysis result");
    } catch (error) {
      this.logger.error(error, "Failed to save subordinated debt analysis result to DynamoDB");
      throw error;
    }
  }
}
