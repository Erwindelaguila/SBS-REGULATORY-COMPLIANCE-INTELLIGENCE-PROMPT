import { CsvRecordData } from "../model/csv-record-data";

export interface CsvProcessor {
  process(recordData: CsvRecordData): Promise<Record<string, any>[]>;
}
