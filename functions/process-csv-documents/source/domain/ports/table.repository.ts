export interface TableRepository {
  insertRecords(records: Record<string, any>[]): Promise<void>;
}
