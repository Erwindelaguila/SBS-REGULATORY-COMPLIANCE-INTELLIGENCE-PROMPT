export interface SupervisoryRecordsRepository {
  updateProcessedKey(recordId: string, processedKey: string): Promise<void>;
  updateRecord(
    supervisedEntityId: string,
    recordId: string,
    updates: { analysisStarted?: string; analysisFinished?: string }
  ): Promise<void>;
}
