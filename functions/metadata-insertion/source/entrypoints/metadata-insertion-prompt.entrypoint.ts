import { DynamoDBRecord } from "aws-lambda";
import { MetadataInsertionPromptCommandHandler } from "../domain/command-handlers/metadata-insertion-prompt.command-handler";
import {
  MetadataInsertionPromptCommand,
  MetadataInsertionPromptCommandRecord,
} from "../domain/commands/metadata-insertion-prompt.command";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import path from "path";
import { Logger } from "pino";

type MetadataInsertionPromptInput = {
  insertRecords: Record<string, any>[];
};

export class MetadataInsertionPromptEntryPoint {
  constructor(
    private readonly metadataInsertionPromptCommandHandler: MetadataInsertionPromptCommandHandler,
    private readonly logger: Logger,
  ) {}

  public async handleRequest(metadataInsInput: MetadataInsertionPromptInput): Promise<void> {
    const records: MetadataInsertionPromptCommandRecord[] = metadataInsInput.insertRecords
      .map<MetadataInsertionPromptCommandRecord>((insertRecord) => ({
        recordId: insertRecord.id,
        key: insertRecord.key,
        metadata: insertRecord.metadata,
        sessionId: insertRecord.sessionId,
        parentId: insertRecord.parentId,
        application: insertRecord.application,
        documentType: insertRecord.documentType,
      }))
      .filter((record) => path.extname(record.key) === ".pdf");

    this.logger.info(`Received ${records.length} records to process`);

    if (records.length === 0) {
      return;
    }

    const command = MetadataInsertionPromptCommand.createCommand(records);
    await this.metadataInsertionPromptCommandHandler.handle(command);
  }
}
