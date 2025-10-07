import { Metadata } from "../model/metadata";

export interface SupervisoryRecordMetadataRepository {
  createMetadata(metadata: Metadata[]): Promise<void>;
}
