import { FileData } from "../ports/file-storage.client";
import { Application } from "./application";

export type RecordFileData = {
  recordId: string;
  supervisedEntityId: string;
  file: FileData;
  application: Application;
  sessionId: string;
  parentId: string;
};
