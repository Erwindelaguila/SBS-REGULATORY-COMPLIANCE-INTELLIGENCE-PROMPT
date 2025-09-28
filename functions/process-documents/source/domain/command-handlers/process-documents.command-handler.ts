import { Logger } from "pino";
import { parse } from "path";

import { ProcessDocumentsCommand, ProcessDocumentsCommandRecord } from "../commands/metadata-insertion-prompt.command";

import { FileData, FileStorageClient } from "../ports/file-storage.client";
import { SupervisoryRecordsRepository } from "../ports/supervisory-records.repository";

import { parseISO, getYear, getMonth } from "date-fns";

import { execSync } from "child_process";

import { v4 as uuidv4 } from "uuid";
import { readdir, readFile, unlink, writeFile } from "fs/promises";
import { log } from "console";
import { EventProducerClient } from "../ports/event-producer.client";
import { NotificationType } from "../model/notification-type";

export class ProcessDocumentsCommandHandler {
  constructor(
    private readonly recordsFileStorageClient: FileStorageClient,
    private readonly processedRecordsFileStorageClient: FileStorageClient,
    private readonly supervisoryRecordsRepository: SupervisoryRecordsRepository,
    private readonly eventProducerClient: EventProducerClient,
    private readonly logger: Logger,
  ) {}

  async getRecordsFiles(records: ProcessDocumentsCommandRecord[]) {
    const filesResults = await Promise.allSettled(
      records.map(async (record) => {
        const file = await this.recordsFileStorageClient.getFileByKey(record.key);
        return {
          recordId: record.recordId,
          file,
        };
      }),
    );

    return new Map<string, FileData>(
      filesResults
        .filter((fileResult) => fileResult.status === "fulfilled")
        .map((fileResult) => {
          const result = fileResult as PromiseFulfilledResult<{ recordId: string; file: FileData }>;
          return [result.value.recordId, result.value.file];
        }),
    );
  }

  async handle(command: ProcessDocumentsCommand): Promise<void> {
    try {
      this.logger.info({ home: process.env.HOME }, "Home");

      const pdfContentType = "application/pdf";
      const filesRecordsMap = await this.getRecordsFiles(command.records);
      const processedKeys = new Map<string, string>();

      for (const [recordId, file] of filesRecordsMap) {
        const fileNameData = parse(file.key);
        let processedKey = `pdfs/${fileNameData.name}.pdf`;
        processedKeys.set(recordId, processedKey);

        this.logger.info({ type: file.contentType }, "Type");

        try {
          let bytes: Uint8Array;
          if (file.contentType === "application/pdf") {
            bytes = file.bytes;
          } else if (file.contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            const id = uuidv4();
            const originalTmpFile = `/tmp/${id}.docx`;
            const convertedTmpFile = `/tmp/${id}.pdf`;

            await writeFile(originalTmpFile, Buffer.from(file.bytes));
            execSync(`
              cd /tmp
              libreoffice25.2 --headless --invisible --nodefault --view --nolockcheck --nologo --norestore --convert-to pdf --outdir /tmp ./${id}.docx
            `);

            const tmpDir = await readdir("/tmp");
            this.logger.debug({ files: tmpDir }, "Files");
            bytes = await readFile(convertedTmpFile);

            const results = await Promise.allSettled([unlink(originalTmpFile), unlink(convertedTmpFile)]);
            this.logger.debug({ results }, "Results");
          } else {
            this.logger.error({ file }, "Unsupported file type");
            continue;
          }

          await this.processedRecordsFileStorageClient.saveFile(processedKey, bytes, pdfContentType);
          await this.supervisoryRecordsRepository.updateProcessedKey(recordId, processedKey);
        } catch (error) {
          this.logger.error(error, `Failed to process record ${recordId}`);
        }
      }

      await this.eventProducerClient.sendEvents([
        {
          topic: NotificationType.InsertMetadata,
          messages: command.records.map((record) => {
            const period = parseISO(record.period);
            const processedKey = processedKeys.get(record.recordId);

            return {
              key: record.recordId,
              value: JSON.stringify({
                recordId: record.recordId,
                key: processedKey,
                documentType: record.documentType,
                periodMonth: getMonth(period).toString(),
                periodYear: getYear(period).toString(),
                sessionId: record.sessionId,
                parentId: record.parentId,
              }),
            };
          }),
        },
      ]);
    } catch (error) {
      this.logger.error(error, `Failed to process for records`);
    }
  }
}
