import { Application } from "../model/application";
import { DocumentType } from "../model/document-type";

export type MetadataInsertionPromptCommandRecord = {
  recordId: string;
  parentId: string;
  key: string;
  metadata: Record<string, any>;
  sessionId: string;
  documentType: DocumentType;
  application: Application;
};

export class MetadataInsertionPromptCommand {
  private constructor(public readonly records: MetadataInsertionPromptCommandRecord[]) {}

  static createCommand(records: MetadataInsertionPromptCommandRecord[]): MetadataInsertionPromptCommand {
    return new MetadataInsertionPromptCommand(records);
  }
}
