export interface SupervisoryRecordsRepository {
  updateProcessedKey(recordId: string, processedKey: string): Promise<void>;
}
