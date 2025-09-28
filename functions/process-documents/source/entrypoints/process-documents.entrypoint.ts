import { DynamoDBRecord } from "aws-lambda";
import { ProcessDocumentsCommandHandler } from "../domain/command-handlers/process-documents.command-handler";
import {
  ProcessDocumentsCommand,
  ProcessDocumentsCommandRecord,
} from "../domain/commands/metadata-insertion-prompt.command";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import path from "path";
import { Logger } from "pino";

type ProcessDocumentsInput = {
  insertRecords: Record<string, any>[];
};

export class ProcessDocumentsEntryPoint {
  constructor(
    private readonly processDocumentsCommandHandler: ProcessDocumentsCommandHandler,
    private readonly logger: Logger,
  ) {}

  public async handleRequest(processDocumentsInput: ProcessDocumentsInput): Promise<void> {
    const records: ProcessDocumentsCommandRecord[] = processDocumentsInput.insertRecords
      .map<ProcessDocumentsCommandRecord>((insertRecord) => ({
        recordId: insertRecord.id,
        key: insertRecord.key,
        metadata: insertRecord.metadata,
        sessionId: insertRecord.sessionId,
        parentId: insertRecord.parentId,
        application: insertRecord.application,
        documentType: insertRecord.documentType,
        period: insertRecord.period,
      }))
      .filter((record) => {
        const ext = path.extname(record.key);
        return ext === ".pdf" || ext === ".docx";
      });

    this.logger.info(`Received ${records.length} records to process`);

    if (records.length === 0) {
      return;
    }

    const command = ProcessDocumentsCommand.createCommand(records);
    await this.processDocumentsCommandHandler.handle(command);
  }
}
