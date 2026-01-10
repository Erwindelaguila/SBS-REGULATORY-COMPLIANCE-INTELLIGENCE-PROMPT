export interface SupervisoryRecord {
  id: string;
  key: string;
  [key: string]: any;
}

export interface SupervisoryRecordsRepository {
  getRecordById(recordId: string): Promise<SupervisoryRecord>;
}
