import { Metadata } from "../model/metadata";

export interface SupervisoryRecordMetadataRepository {
  insertMetadata(metadata: Metadata[]): Promise<void>;
  getMetadataBySupervisoryRecordId(supervisoryRecordId: string): Promise<Metadata[]>;
}
