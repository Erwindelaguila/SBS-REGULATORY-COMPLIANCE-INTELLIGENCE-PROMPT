export interface SupervisoryRecordsRepository {
  updateMetadata(recordId: string, metadata: Record<string, any>): Promise<void>;
  
}