import { Logger } from "pino";
import { FileStorageClient } from "../domain/ports/file-storage.client";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

type FileData = {
  key: string;
  bytes: Uint8Array;
  contentType: string;
}

export class S3FileStorageClient implements FileStorageClient {
  constructor(
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
    private readonly logger: Logger
  ) {}
  async getFilesByKey(keys: string[]): Promise<FileData[]> {
    try {
      const results =  [];
      for (const key of keys) {
        const command = new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key
        });
        const response = await this.s3Client.send(command);
        // TODO throw error: not found
        const fileInBytes = await response.Body?.transformToByteArray();
        const contentType = response.ContentType
        // TODO throw error: fileInBytes is undefined
        results.push({
          key,
          bytes: fileInBytes!,
          contentType: contentType!
        }); 
        // TODO: ensure fileInBytes is not undefined
      }
      return results;
    } catch (error) {
      // TODO: Handle specific S3 errors
      if (error instanceof Error) {
        console.error("Failed to get files by key:", error);
      }
      throw error;
    }
  }
}