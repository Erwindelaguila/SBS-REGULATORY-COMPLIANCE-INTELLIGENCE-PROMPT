import { Application } from "../model/application";
import { DocumentType } from "../model/document-type";

export type ProcessDocumentsCommandRecord = {
  recordId: string;
  parentId: string;
  key: string;
  metadata: Record<string, any>;
  sessionId: string;
  documentType: DocumentType;
  period: string;
  application: Application;
};

export class ProcessDocumentsCommand {
  private constructor(public readonly records: ProcessDocumentsCommandRecord[]) {}

  static createCommand(records: ProcessDocumentsCommandRecord[]): ProcessDocumentsCommand {
    return new ProcessDocumentsCommand(records);
  }
}
