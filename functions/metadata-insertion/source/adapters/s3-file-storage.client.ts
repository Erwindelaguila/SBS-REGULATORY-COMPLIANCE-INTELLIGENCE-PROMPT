import { Logger } from "pino";
import { RecordFileData, FileStorageClient } from "../domain/ports/file-storage.client";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

export class S3FileStorageClient implements FileStorageClient {
  constructor (
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
    private readonly logger: Logger
  ) {}

  async getFileByKey(key: string, recordId: string): Promise<RecordFileData> {
    try {
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      }))
      const fileInBytes = await response.Body?.transformToByteArray();
      const contentType = response.ContentType
      return {
        recordId,
        key,
        bytes: fileInBytes!,
        contentType: contentType!
      };
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error(`Failed to get file by key: ${key}`, err);
      }
      this.logger.error(err)
      throw err;
    }
  }
}