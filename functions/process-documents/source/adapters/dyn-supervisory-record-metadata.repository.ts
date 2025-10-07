import { BatchWriteCommand, DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Metadata } from "../domain/model/metadata";
import { SupervisoryRecordMetadataRepository } from "../domain/ports/supervisory-record-metadata.repository";
import { Logger } from "pino";
import { RepositoryError } from "../domain/errors/repository.error";

export class DynSupervisoryRecordMetadataRepository implements SupervisoryRecordMetadataRepository {
  constructor(
    private readonly dynamoDBDocumentClient: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly logger: Logger,
  ) {}

  async createMetadata(metadata: Metadata[]): Promise<void> {
    try {
      await this.dynamoDBDocumentClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.tableName]: metadata.map((metadata) => ({
              PutRequest: {
                Item: metadata,
              },
            })),
          },
        }),
      );
    } catch (error) {
      this.logger.error(error, "An error has ocurred creating metadata");
      throw new RepositoryError("And error has ocurred creating metadata");
    }
  }
}
