import { Logger } from "pino";
import { chunk } from "../../utils";
import { MetadataInsertionPromptCommand } from "../commands/metadata-insertion-prompt.command";
import { AIChatClient, FileMetadata } from "../ports/ai-chat.client";
import { FileStorageClient, RecordFileData } from "../ports/file-storage.client";
import { SupervisoryRecordsRepository } from "../ports/supervisory-records.repository";
import { QueueClient, QueueMessage } from "../ports/queue.client";

import { v4 as uuid } from "uuid";
import { NotificationType } from "../model/notification-type";

export class MetadataInsertionPromptCommandHandler {
  constructor(
    private readonly aiChatClient: AIChatClient,
    private readonly fileStorageClient: FileStorageClient,
    private readonly queueClient: QueueClient,
    private readonly supervisoryRecordsRepository: SupervisoryRecordsRepository,
    private readonly logger: Logger,
  ) {}

  async handle(command: MetadataInsertionPromptCommand): Promise<void> {
    try {
      const filesData = await Promise.allSettled(
        command.records.map((record) => this.fileStorageClient.getFileByKey(record.key, record.recordId)),
      );

      const validFilesData = filesData
        .filter((result) => result.status === "fulfilled" && result.value)
        .map((result) => (result as PromiseFulfilledResult<RecordFileData>).value);

      this.logger.debug(`Fetched ${validFilesData.length} valid files`);

      if (validFilesData.length === 0) {
        return;
      }

      let filesMetadata: FileMetadata[] = [];
      const batches = chunk(validFilesData, 5);
      for (const batch of batches) {
        const fileMetadata = await this.aiChatClient.generateMetadata(command.systemPrompt, command.userPrompt, batch);
        filesMetadata = filesMetadata.concat(fileMetadata);
      }

      this.logger.debug({ filesMetadata }, "Files metadata");

      const results = await Promise.allSettled(
        filesMetadata.map(async (fileMetadata) => {
          const record = command.records.find((record) => record.recordId === fileMetadata.recordId)!;
          await this.supervisoryRecordsRepository.updateMetadata(fileMetadata.recordId, {
            ...record.metadata,
            ...fileMetadata.metadata,
          });
          return {
            recordId: record.recordId,
            parentId: record.parentId,
            sessionId: record.sessionId,
          };
        }),
      );

      const successResults = results
        .filter((result) => result.status === "fulfilled")
        .map<QueueMessage>((result) => ({
          id: uuid(),
          message: {
            sessionId: result.value.sessionId,
            type: NotificationType.InsertMetadata,
            data: {
              recordId: result.value.recordId,
              parentId: result.value.parentId,
            },
          },
        }));

      this.logger.info({ successResults }, "Successful results");
      await this.queueClient.sendMessages(successResults);

      this.logger.debug(
        {
          records: command.records.map((record) => record.recordId),
        },
        "Updated metadata for records",
      );
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to update metadata for records: ${error.message}`);
      }
      throw error;
    }
  }
}
