import { Logger } from "pino";
import { FileData, FileStorageClient } from "../domain/ports/file-storage.client";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { FileStorageError } from "../domain/errors/file-storage.error";

export class S3FileStorageClient implements FileStorageClient {
  constructor(
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
    private readonly logger: Logger,
  ) {}

  async saveFile(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to save file: ${key}`, err);
      throw new FileStorageError("Failed to save file");
    }
  }

  async getFileByKey(key: string): Promise<FileData> {
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      const fileInBytes = await response.Body?.transformToByteArray();
      const contentType = response.ContentType;
      return {
        key,
        bytes: fileInBytes!,
        contentType: contentType!,
      };
    } catch (err) {
      this.logger.error(`Failed to get file by key: ${key}`, err);
      throw new FileStorageError("Failed to get file by key");
    }
  }
}
