import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { Logger } from "pino";
import {
  SubordinatedDebtCriteriaRepository,
  SubordinatedDebtCriterion,
} from "../domain/ports/subordinated-debt-criteria.repository";

export class DynamoDBSubordinatedDebtCriteriaRepository implements SubordinatedDebtCriteriaRepository {
  constructor(
    private readonly dynamoDBClient: DynamoDBClient,
    private readonly tableName: string,
    private readonly logger: Logger,
  ) {}

  async getAllCriteria(): Promise<SubordinatedDebtCriterion[]> {
    try {
      const command = new ScanCommand({
        TableName: this.tableName,
      });

      const response = await this.dynamoDBClient.send(command);

      if (!response.Items || response.Items.length === 0) {
        this.logger.warn("No subordinated debt criteria found in DynamoDB");
        return [];
      }

      return response.Items.map((item) => unmarshall(item) as SubordinatedDebtCriterion);
    } catch (error) {
      this.logger.error(error, "Failed to get subordinated debt criteria from DynamoDB");
      throw error;
    }
  }
}
