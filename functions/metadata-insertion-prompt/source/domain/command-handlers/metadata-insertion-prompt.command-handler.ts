import { Logger } from "pino";
import { AIChatClient } from "../ports/ai-chat.client";
import { FileData, FileStorageClient } from "../ports/file-storage.client";
import { SupervisoryRecordsRepository } from "../ports/supervisory-records.repository";
import { MetadataInsertionPromptCommand } from "../commands/metadata-insertion-prompt.command";
import { chunk } from "../../utils";

export class MetadataInsertionPromptCommandHandler {
  constructor(
    private readonly aiChatClient: AIChatClient,
    private readonly fileStorageClient: FileStorageClient,
    private readonly supervisoryRecordsRepository: SupervisoryRecordsRepository,
    private readonly logger: Logger
  ) {}

  async handle (command: MetadataInsertionPromptCommand): Promise<void> {
    try {
      const filesPromises = command.insertRecords.map(record => {
        if (record.dynamodb?.NewImage) {
          const fileKey = record.dynamodb.NewImage.fileKey.S as string;
          return this.fileStorageClient.getFileByKey(fileKey);
        }
      })
      const filesData = await Promise.allSettled(filesPromises);

      const validFilesData = filesData
        .filter(result => result.status === "fulfilled" && result.value)
        .map(result => (result as PromiseFulfilledResult<FileData>).value);
      
      this.logger.debug(`Fetched ${validFilesData.length} valid files`);

      const newMetadatas: Record<string, any>[] = []

      if (validFilesData.length > 0) {
        const batches = chunk(validFilesData, 5);
        for (const batch of batches) {
          const generatedMetadata = await this.aiChatClient.generateMetadata(command.systemPrompt, command.userPrompt, batch);
          if (Array.isArray(generatedMetadata)) {
            newMetadatas.push(...generatedMetadata);
          } else {
            newMetadatas.push(generatedMetadata);
          }
        }
      }

      const updatePromises = newMetadatas.map(item => 
        this.supervisoryRecordsRepository.updateMetadata(item.id, item)
      );

      await Promise.all(updatePromises);

      
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to update metadata for records: ${error.message}`);
      }
      throw error;
    }
  }
}