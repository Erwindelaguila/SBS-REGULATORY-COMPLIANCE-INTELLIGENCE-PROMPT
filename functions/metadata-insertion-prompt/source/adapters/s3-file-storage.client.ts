import { Logger } from "pino";
import { FileData, FileStorageClient } from "../domain/ports/file-storage.client";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

export class S3FileStorageClient implements FileStorageClient {
  constructor (
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
    private readonly logger: Logger
  ) {}

  async getFileByKey(key: string): Promise<FileData> {
    try {
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      }))
      const fileInBytes = await response.Body?.transformToByteArray();
      const contentType = response.ContentType
      return {
        key,
        bytes: fileInBytes!,
        contentType: contentType!
      };
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error("Failed to get file by key:", err);
      }
      throw err;
    }
  }
}