import { Application } from "./application";

export interface CsvRecordData {
  recordId: string;
  sessionId: string;
  parentId: string;
  application: Application;
  fileContent: Uint8Array;
  key: string;
  period: string;
}
