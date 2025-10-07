import { FileData } from "../ports/file-storage.client";
import { Application } from "./application";

export type RecordFileData = {
  recordId: string;
  file: FileData;
  application: Application;
  sessionId: string;
  parentId: string;
};
