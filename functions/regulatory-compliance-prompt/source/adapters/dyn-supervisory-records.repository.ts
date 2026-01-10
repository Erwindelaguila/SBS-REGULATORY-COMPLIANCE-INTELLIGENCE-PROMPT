import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { Logger } from "pino";
import { SupervisoryRecordsRepository, SupervisoryRecord } from "../domain/ports/supervisory-records.repository";

export class DynSupervisoryRecordsRepository implements SupervisoryRecordsRepository {
  constructor(
    private readonly dynamoDBDocumentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly logger: Logger,
  ) {}

  async getRecordById(recordId: string): Promise<SupervisoryRecord> {
    try {
      const command = new GetCommand({
        TableName: this.tableName,
        Key: {
          id: recordId,
        },
      });

      const response = await this.dynamoDBDocumentClient.send(command);
      
      if (!response.Item) {
        throw new Error(`Record not found: ${recordId}`);
      }

      return response.Item as SupervisoryRecord;
    } catch (error) {
      this.logger.error({ error, recordId }, "Failed to get supervisory record");
      throw error;
    }
  }
}
