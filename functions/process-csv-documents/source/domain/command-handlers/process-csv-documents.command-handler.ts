import { Logger } from "pino";
import { v4 as uuidv4 } from "uuid";
import { ProcessCsvDocumentsCommand, ProcessCsvDocumentsCommandRecord } from "../commands/process-csv-documents.command";
import { FileStorageClient } from "../ports/file-storage.client";
import { EventProducerClient } from "../ports/event-producer.client";
import { QueueClient } from "../ports/queue.client";
import { TableRepository } from "../ports/table.repository";
import { Application } from "../model/application";
import { DocumentType } from "../model/document-type";
import { NotificationType } from "../model/notification-type";
import { CsvRecordData } from "../model/csv-record-data";
import { WarrantyRegulatoryReportsProcessor } from "../processors/warranty-regulatory-reports.processor";
import { WarrantyInternalTablesProcessor } from "../processors/warranty-internal-tables.processor";
import { LetterRegulatoryReportsProcessor } from "../processors/letter-regulatory-reports.processor";
import { LetterInternalTablesProcessor } from "../processors/letter-internal-tables.processor";

export class ProcessCsvDocumentsCommandHandler {
  constructor(
    private readonly fileStorageClient: FileStorageClient,
    private readonly warrantyRRRepository: TableRepository,
    private readonly warrantyITRepository: TableRepository,
    private readonly letterRRRepository: TableRepository,
    private readonly letterITRepository: TableRepository,
    private readonly eventProducerClient: EventProducerClient,
    private readonly queueClient: QueueClient,
    private readonly logger: Logger,
  ) {}

  async handle(command: ProcessCsvDocumentsCommand): Promise<void> {
    const recordsByType = this.groupRecordsByType(command.records);

    for (const [type, records] of Object.entries(recordsByType)) {
      if (records.length === 0) continue;

      try {
        await this.processRecordGroup(type, records);
      } catch (error) {
        this.logger.error({ error, type, count: records.length }, "Failed to process record group");
      }
    }
  }

  private groupRecordsByType(
    records: ProcessCsvDocumentsCommandRecord[],
  ): Record<string, ProcessCsvDocumentsCommandRecord[]> {
    const groups: Record<string, ProcessCsvDocumentsCommandRecord[]> = {
      WARRANTY_REGULATORY: [],
      WARRANTY_INTERNAL: [],
      LETTER_REGULATORY: [],
      LETTER_INTERNAL: [],
    };

    for (const record of records) {
      if (record.application === Application.WARRANTY && record.documentType === DocumentType.REGULATORY) {
        groups.WARRANTY_REGULATORY.push(record);
      } else if (record.application === Application.WARRANTY && record.documentType === DocumentType.INTERNAL) {
        groups.WARRANTY_INTERNAL.push(record);
      } else if (record.application === Application.LETTER && record.documentType === DocumentType.REGULATORY) {
        groups.LETTER_REGULATORY.push(record);
      } else if (record.application === Application.LETTER && record.documentType === DocumentType.INTERNAL) {
        groups.LETTER_INTERNAL.push(record);
      }
    }

    return groups;
  }

  private async processRecordGroup(type: string, records: ProcessCsvDocumentsCommandRecord[]): Promise<void> {
    this.logger.info({ type, count: records.length }, "Processing record group");

    const filesData = await this.getRecordsFiles(records);

    for (const record of records) {
      const fileData = filesData.get(record.recordId);
      if (!fileData) {
        this.logger.warn({ recordId: record.recordId }, "File not found for record");
        continue;
      }

      try {
        const csvRecordData: CsvRecordData = {
          recordId: record.recordId,
          sessionId: record.sessionId,
          parentId: record.parentId,
          application: record.application,
          fileContent: fileData.bytes,
          key: record.key,
          period: record.period,
        };

        const processedRecords = await this.processRecord(type, csvRecordData);
        await this.uploadToTable(type, processedRecords);
        await this.sendNotifications(type, csvRecordData, processedRecords.length);
      } catch (error) {
        this.logger.error({ error, recordId: record.recordId, type }, "Failed to process individual record");
      }
    }
  }

  private async getRecordsFiles(records: ProcessCsvDocumentsCommandRecord[]): Promise<Map<string, { bytes: Uint8Array }>> {
    const filesResults = await Promise.allSettled(
      records.map(async (record) => {
        const file = await this.fileStorageClient.getFileByKey(record.key);
        return { recordId: record.recordId, bytes: file.bytes };
      }),
    );

    return new Map(
      filesResults
        .filter((result) => result.status === "fulfilled")
        .map((result) => {
          const fulfilled = result as PromiseFulfilledResult<{ recordId: string; bytes: Uint8Array }>;
          return [fulfilled.value.recordId, { bytes: fulfilled.value.bytes }];
        }),
    );
  }

  private async processRecord(type: string, recordData: CsvRecordData): Promise<Record<string, any>[]> {
    let processor;

    switch (type) {
      case "WARRANTY_REGULATORY":
        processor = new WarrantyRegulatoryReportsProcessor(this.logger);
        break;
      case "WARRANTY_INTERNAL":
        processor = new WarrantyInternalTablesProcessor(this.logger);
        break;
      case "LETTER_REGULATORY":
        processor = new LetterRegulatoryReportsProcessor(this.logger);
        break;
      case "LETTER_INTERNAL":
        processor = new LetterInternalTablesProcessor(this.logger);
        break;
      default:
        throw new Error(`Unknown record type: ${type}`);
    }

    return await processor.process(recordData);
  }

  private async uploadToTable(type: string, records: Record<string, any>[]): Promise<void> {
    let repository: TableRepository;

    switch (type) {
      case "WARRANTY_REGULATORY":
        repository = this.warrantyRRRepository;
        break;
      case "WARRANTY_INTERNAL":
        repository = this.warrantyITRepository;
        break;
      case "LETTER_REGULATORY":
        repository = this.letterRRRepository;
        break;
      case "LETTER_INTERNAL":
        repository = this.letterITRepository;
        break;
      default:
        throw new Error(`Unknown record type: ${type}`);
    }

    await repository.insertRecords(records);
  }

  private async sendNotifications(type: string, recordData: CsvRecordData, recordCount: number): Promise<void> {
    let kafkaTopic: string;
    let notificationType: string;

    switch (type) {
      case "WARRANTY_REGULATORY":
        kafkaTopic = NotificationType.InsertWarrantyRegulatoryReport;
        notificationType = NotificationType.InsertWarrantyRegulatoryReport;
        break;
      case "WARRANTY_INTERNAL":
        kafkaTopic = NotificationType.InsertWarrantyInternalTable;
        notificationType = NotificationType.InsertWarrantyInternalTable;
        break;
      case "LETTER_REGULATORY":
        kafkaTopic = NotificationType.InsertLetterRegulatoryReport;
        notificationType = NotificationType.InsertLetterRegulatoryReport;
        break;
      case "LETTER_INTERNAL":
        kafkaTopic = NotificationType.InsertLetterInternalTable;
        notificationType = NotificationType.InsertLetterInternalTable;
        break;
      default:
        throw new Error(`Unknown record type: ${type}`);
    }

    await this.eventProducerClient.sendEvents([
      {
        topic: kafkaTopic,
        messages: [
          {
            key: recordData.recordId,
            value: JSON.stringify({
              recordId: recordData.recordId,
              key: recordData.key,
              period: recordData.period,
              sessionId: recordData.sessionId,
              parentId: recordData.parentId,
              recordCount,
            }),
          },
        ],
      },
    ]);

    await this.queueClient.sendMessages([
      {
        id: uuidv4(),
        message: {
          sessionId: recordData.sessionId,
          type: notificationType,
          data: {
            recordId: recordData.recordId,
            parentId: recordData.parentId,
            recordCount,
          },
        },
      },
    ]);

    this.logger.info({ type, recordId: recordData.recordId, recordCount }, "Notifications sent");
  }
}
