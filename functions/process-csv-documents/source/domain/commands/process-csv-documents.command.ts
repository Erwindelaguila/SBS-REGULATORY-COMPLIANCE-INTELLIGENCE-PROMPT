import { Application } from "../model/application";
import { DocumentType } from "../model/document-type";

export interface ProcessCsvDocumentsCommandRecord {
  recordId: string;
  key: string;
  sessionId: string;
  parentId: string;
  application: Application;
  documentType: DocumentType;
  period: string;
  supervisedEntityId: string;
}

export class ProcessCsvDocumentsCommand {
  private constructor(public readonly records: ProcessCsvDocumentsCommandRecord[]) {}

  static createCommand(records: ProcessCsvDocumentsCommandRecord[]): ProcessCsvDocumentsCommand {
    return new ProcessCsvDocumentsCommand(records);
  }
}
