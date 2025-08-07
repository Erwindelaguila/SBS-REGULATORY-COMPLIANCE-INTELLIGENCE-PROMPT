import { Logger } from "pino";
import { FileStorageClient } from "../domain/ports/file-storage.client";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

export class S3FileStorageClient implements FileStorageClient {
  constructor(
    private readonly s3Client: S3Client,
    private readonly bucketName: string,
    private readonly logger: Logger
  ) {}
  async getFilesByKey(keys: string[]): Promise<Uint8Array[]> {
    try {
      const results: Uint8Array[] = [];
      for (const key of keys) {
        const command = new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key
        });
        const response = await this.s3Client.send(command);
        // TODO throw error: not found
        const fileInBytes = await response.Body?.transformToByteArray();
        // TODO throw error: fileInBytes is undefined
        results.push(fileInBytes as Uint8Array); // TODO: ensure is not undefined
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