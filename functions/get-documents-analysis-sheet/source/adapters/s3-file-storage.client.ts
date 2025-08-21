import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { FileStorageClient } from "../domain/ports/file-storage.client";
import { Logger } from "pino";
import { FileStorageError, NotFoundError } from "../domain/errors/file-storage.error";

export class S3FileStorageClient implements FileStorageClient {
  constructor(
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
    private readonly logger: Logger,
  ) {}
  async getObjectByKey(key: string): Promise<Buffer> {
    try {
      const object = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      if (object.Body === undefined) {
        throw new NotFoundError("File not found");
      }

      const arrayBuffer = await object.Body.transformToByteArray();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.error({ error, key }, "Error getting object from S3");
      throw new FileStorageError("Error getting object from S3");
    }
  }
}
