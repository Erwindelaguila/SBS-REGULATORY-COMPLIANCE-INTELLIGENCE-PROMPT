import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  QueryCommandOutput,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
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

  async getMetadataBySupervisoryRecordId(supervisoryRecordId: string): Promise<Metadata[]> {
    let queryCommandOutput: QueryCommandOutput;

    try {
      queryCommandOutput = await this.dynamoDBDocumentClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: "supervisoryRecordId-index",
          KeyConditionExpression: "#supervisoryRecordId = :supervisoryRecordId",
          ExpressionAttributeNames: {
            "#supervisoryRecordId": "supervisoryRecordId",
          },
          ExpressionAttributeValues: {
            ":supervisoryRecordId": supervisoryRecordId,
          },
        }),
      );
    } catch (error) {
      this.logger.error(error, "An error has ocurred getting metadata");
      throw new RepositoryError("An error has ocurred getting metadata");
    }

    if (queryCommandOutput.Items === undefined || queryCommandOutput.Count === 0) {
      return [];
    }

    return queryCommandOutput.Items.map((item) => ({
      id: item.id,
      metadata: item.metadata,
      supervisoryRecordId: item.supervisoryRecordId,
    }));
  }

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
      throw new RepositoryError("An error has ocurred creating metadata");
    }
  }

  async updateMetadata(id: string, metadata: Record<string, any>): Promise<void> {
    try {
      await this.dynamoDBDocumentClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            id: id,
          },
          UpdateExpression: "SET #metadata = :metadata",
          ExpressionAttributeNames: {
            "#metadata": "metadata",
          },
          ExpressionAttributeValues: {
            ":metadata": metadata,
          },
        }),
      );
    } catch (error) {
      this.logger.error(error, "An error has ocurred updating metadata");
      throw new RepositoryError("An error has ocurred updating metadata");
    }
  }

  async insertMetadata(metadata: Metadata[]): Promise<void> {
    if (metadata.length === 0) {
      return;
    }

    let newMetadataMap = new Map<string, Metadata[]>();
    metadata.forEach((metadata) => {
      const supervisoryRecordId = metadata.supervisoryRecordId;
      if (!newMetadataMap.has(supervisoryRecordId)) {
        newMetadataMap.set(supervisoryRecordId, [metadata]);
      } else {
        newMetadataMap.get(supervisoryRecordId)!.push(metadata);
      }
    });

    let existingMetadataMap = new Map<string, Metadata[]>();
    const existingMetadataTask = await Promise.allSettled(
      Array.from(newMetadataMap.keys()).map((recordId) => this.getMetadataBySupervisoryRecordId(recordId)),
    );

    existingMetadataTask
      .filter((task) => task.status === "fulfilled")
      .flatMap((task) => task.value)
      .forEach((metadata) => {
        const supervisoryRecordId = metadata.supervisoryRecordId;
        if (!existingMetadataMap.has(supervisoryRecordId)) {
          existingMetadataMap.set(supervisoryRecordId, [metadata]);
        } else {
          existingMetadataMap.get(supervisoryRecordId)!.push(metadata);
        }
      });

    for (const [supervisoryRecordId, newMetadata] of newMetadataMap) {
      const existingMetadata = existingMetadataMap.get(supervisoryRecordId) || [];

      this.logger.debug(
        {
          supervisoryRecordId,
          existingMetadata: existingMetadata.map((metadata) => metadata.id),
          newMetadata: newMetadata.map((metadata) => metadata.id),
        },
        "Metadata",
      );

      if (existingMetadata.length === 0) {
        await this.createMetadata(newMetadata);
      } else {
        const metadataId = existingMetadata[0].id;
        await this.updateMetadata(metadataId, {
          ...existingMetadata[0].metadata,
          ...newMetadata[0].metadata,
        });
      }
    }
  }
}
