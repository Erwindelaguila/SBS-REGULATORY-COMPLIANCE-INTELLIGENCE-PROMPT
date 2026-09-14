export type AnalysisError = {
  at: string;
  code: string;
  message: string;
};

export type RecordAnalysisUpdates = {
  analysisStarted?: string;
  analysisFinished?: string;
  analysisError?: AnalysisError;
  clearAnalysisStarted?: boolean;
};

export interface SupervisoryRecordsRepository {
  updateProcessedKey(recordId: string, processedKey: string): Promise<void>;
  updateRecord(supervisedEntityId: string, recordId: string, updates: RecordAnalysisUpdates): Promise<void>;
}
