import { Logger } from "pino";
import { AIChatClient } from "../ports/ai-chat.client";
import { RecordFileData, FileStorageClient } from "../ports/file-storage.client";
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
          const fileKey = record.dynamodb.NewImage.key.S as string;
          const recordId = record.dynamodb.NewImage.id.S as string;
          return this.fileStorageClient.getFileByKey(fileKey, recordId);
        }
      })
      const filesData = await Promise.allSettled(filesPromises);

      const validFilesData = filesData
        .filter(result => result.status === "fulfilled" && result.value)
        .map(result => (result as PromiseFulfilledResult<RecordFileData>).value);
      
      this.logger.debug(`Fetched ${validFilesData.length} valid files`);

      const newMetadatas: { recordsId: string[], metadata: Record<string, any> }[] = []

      if (validFilesData.length > 0) {
        const batches = chunk(validFilesData, 5);
        for (const batch of batches) {
          const generatedMetadata = await this.aiChatClient.generateMetadata(command.systemPrompt, command.userPrompt, batch);
          const recordsWithMetadata = {
            recordsId: batch.map(file => file.recordId),
            metadata: generatedMetadata
          }
          newMetadatas.push(recordsWithMetadata);
        }
      }

      // relate each metadata with each recordId
      const metadataMap = newMetadatas.reduce((acc, item) => {
        item.recordsId.forEach((recordId) => {
          acc[recordId] = item.metadata[0];
        });
        return acc;
      }, {} as Record<string, any>);

      const updatePromises = Object.entries(metadataMap).map(([recordId, metadata]) =>
        this.supervisoryRecordsRepository.updateMetadata(recordId, metadata)
      );

      await Promise.allSettled(updatePromises);

      this.logger.debug(`Updated metadata for records: ${Object.keys(metadataMap).join(", ")}`);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to update metadata for records: ${error.message}`);
      }
      throw error;
    }
  }
}