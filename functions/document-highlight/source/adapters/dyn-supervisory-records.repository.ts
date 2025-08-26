import { DynamoDBDocumentClient, GetCommand, GetCommandInput } from "@aws-sdk/lib-dynamodb";
import { Logger } from "pino";
import { SupervisoryRecord, SupervisoryRecordsRepository } from "../domain/ports/supervisory-records.repository";

export class DynSupervisoryRecordsRepository implements SupervisoryRecordsRepository {
  constructor(
    private readonly dynamoDBDocumentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly logger: Logger
  ) {}

  async getRecordById(id: string): Promise<SupervisoryRecord | null> {
    try {
      this.logger.debug({ id }, `Fetching record from DynamoDB`);
      
      const params: GetCommandInput = {
        TableName: this.tableName,
        Key: {
          id: id
        }
      };
      
      const result = await this.dynamoDBDocumentClient.send(new GetCommand(params));
      
      if (!result.Item) {
        this.logger.debug({ id }, "Record not found in DynamoDB");
        return null;
      }
      
      this.logger.debug({ id, key: result.Item.key }, "Record found successfully");
      
      return {
        id: result.Item.id,
        key: result.Item.key,
        metadata: result.Item.metadata || {}
      };
    } catch (error) {
      this.logger.error({ error, id }, `Error fetching record from DynamoDB`);
      throw error;
    }
  }
}