import { Logger } from "pino";
import { ProcessCsvDocumentsCommandHandler } from "../domain/command-handlers/process-csv-documents.command-handler";
import {
  ProcessCsvDocumentsCommand,
  ProcessCsvDocumentsCommandRecord,
} from "../domain/commands/process-csv-documents.command";
import path from "path";

type ProcessCsvDocumentsInput = {
  insertRecords: Record<string, any>[];
};

export class ProcessCsvDocumentsEntryPoint {
  constructor(
    private readonly processCSVDocumentsCommandHandler: ProcessCsvDocumentsCommandHandler,
    private readonly logger: Logger,
  ) { }

  public async handleRequest(processCSVDocumentsInput: ProcessCsvDocumentsInput): Promise<void> {
    const records: ProcessCsvDocumentsCommandRecord[] = processCSVDocumentsInput.insertRecords
      .map<ProcessCsvDocumentsCommandRecord>((insertRecord) => ({
        recordId: insertRecord.id,
        key: insertRecord.key,
        sessionId: insertRecord.sessionId,
        parentId: insertRecord.parentId,
        application: insertRecord.application,
        documentType: insertRecord.documentType,
        period: insertRecord.period,
        supervisedEntityId: insertRecord.supervisedEntityId,
      }))
      .filter((record) => {
        const ext = path.extname(record.key).toLowerCase();
        const isValidDocumentType = record.documentType === "REGULATORY" || record.documentType === "INTERNAL";

        if (record.application === "LETTER") {
          return (ext === ".csv" || ext === ".xlsx") && isValidDocumentType;
        }

        return ext === ".csv" && isValidDocumentType;
      });

    this.logger.info(`Received ${records.length} CSV records to process`);

    if (records.length === 0) {
      return;
    }

    const command = ProcessCsvDocumentsCommand.createCommand(records);
    await this.processCSVDocumentsCommandHandler.handle(command);
  }
}
