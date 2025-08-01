export interface SupervisoryRecord {
  id: string;
  key: string;
  metadata?: Record<string, any>;
}

export interface SupervisoryRecordsRepository {
  getRecordById(id: string): Promise<SupervisoryRecord | null>;
}