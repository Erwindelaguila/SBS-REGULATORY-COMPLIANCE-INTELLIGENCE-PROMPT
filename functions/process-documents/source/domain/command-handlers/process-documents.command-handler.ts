import { Logger } from "pino";
import { parse } from "path";

import { ProcessDocumentsCommand, ProcessDocumentsCommandRecord } from "../commands/metadata-insertion-prompt.command";

import { FileStorageClient } from "../ports/file-storage.client";
import { SupervisoryRecordsRepository } from "../ports/supervisory-records.repository";

import { parseISO, getYear, getMonth } from "date-fns";

import { execSync } from "child_process";

import { v4 as uuidv4 } from "uuid";
import { readdir, readFile, unlink, writeFile } from "fs/promises";
import { EventProducerClient } from "../ports/event-producer.client";
import { NotificationType } from "../model/notification-type";
import { SystemPromptsRepository } from "../ports/system-prompts.repository";
import { Application } from "../model/application";
import { DocumentType } from "../model/document-type";
import { PromptType } from "../model/prompt-type";
import { AIChatClient } from "../ports/ai-chat.client";
import { RecordFileData } from "../model/record-file-data";
import { SupervisoryRecordMetadataRepository } from "../ports/supervisory-record-metadata.repository";
import { QueueClient } from "../ports/queue.client";
import { Notification } from "../model/notification";

export class ProcessDocumentsCommandHandler {
  private readonly prompt =
    'Debes responder con una cadena JSON válida, lista para usarse directamente como parámetro de la función JSON.parse() de Node.js. Tu respuesta debe ser solo una cadena JSON, sin ningún texto adicional, sin comentarios, sin saltos de línea, y sin formato de bloque de código (por ejemplo, no incluyas ```json). La estructura debe ser siempre un arreglo de objetos. Nunca devuelvas un objeto único o estructuras anidadas. Cada objeto debe tener la siguiente estructura: {"metadata": {/* claves y valores concretos y planos */}, "recordId": "nombre_del_archivo.pdf"}. Todos los valores deben ser cadenas planas, usando solo caracteres ASCII. No uses comillas curvas (“ ”), guiones largos (–), ni saltos de línea. Usa solo comillas dobles ("), guiones normales (-) y texto plano. La salida debe estar completamente en una sola línea. Ejemplo de formato correcto: [{"metadata":{"clave":"valor"},"recordId":"archivo.pdf"}]. Recuerda: responde únicamente con el arreglo JSON, en una sola línea. Nada más.';

  constructor(
    private readonly recordsFileStorageClient: FileStorageClient,
    private readonly processedRecordsFileStorageClient: FileStorageClient,
    private readonly aiChatClient: AIChatClient,
    private readonly queueClient: QueueClient,
    private readonly supervisoryRecordsRepository: SupervisoryRecordsRepository,
    private readonly systemPromptsRepository: SystemPromptsRepository,
    private readonly supervisoryRecordMetadataRepository: SupervisoryRecordMetadataRepository,
    private readonly eventProducerClient: EventProducerClient,
    private readonly logger: Logger,
  ) {}

  async getRecordsFiles(records: ProcessDocumentsCommandRecord[]) {
    const filesResults = await Promise.allSettled(
      records.map<Promise<RecordFileData>>(async (record) => {
        const file = await this.recordsFileStorageClient.getFileByKey(record.key);
        return {
          application: record.application,
          recordId: record.recordId,
          sessionId: record.sessionId,
          parentId: record.parentId,
          file,
        };
      }),
    );

    return new Map<string, RecordFileData>(
      filesResults
        .filter((fileResult) => fileResult.status === "fulfilled")
        .map<[string, RecordFileData]>((fileResult) => {
          const result = fileResult as PromiseFulfilledResult<RecordFileData>;
          return [result.value.recordId, result.value];
        }),
    );
  }

  async extractMetadata(recordFileDataMap: Map<string, RecordFileData>): Promise<void> {
    const recordData = Array.from(recordFileDataMap.entries())
      .filter(([_, recordFileData]) => recordFileData.application === Application.DOCUMENT_LOAD)
      .map(([_, recordFileData]) => recordFileData);

    if (recordData.length === 0) {
      this.logger.info("No records to extract metadata");
      return;
    }

    this.logger.info({ records: recordData.map((record) => record.recordId) }, "Extracting metadata");

    const systemPrompts = await this.systemPromptsRepository.getSystemPromptByApplicationAndDocumentTypeAndPromptType(
      Application.DOCUMENT_LOAD,
      DocumentType.DEFAULT,
      PromptType.METADATA,
    );

    const recordMetadata = await this.aiChatClient.generateMetadata(this.prompt, systemPrompts.prompt, recordData);
    this.logger.info({ recordMetadata: recordMetadata.length }, "Record metadata");

    await this.supervisoryRecordMetadataRepository.insertMetadata(
      recordMetadata.map((recordMetadata) => {
        return {
          id: uuidv4(),
          metadata: recordMetadata.metadata,
          supervisoryRecordId: recordMetadata.recordId,
        };
      }),
    );

    await this.queueClient.sendMessages(
      recordMetadata.map((recordMetadata) => {
        const record = recordFileDataMap.get(recordMetadata.recordId)!;
        return {
          id: uuidv4(),
          message: {
            sessionId: record.sessionId,
            type: NotificationType.InsertDocumentLoadMetadata,
            data: {
              recordId: record.recordId,
              parentId: record.parentId,
            },
          },
        };
      }),
    );
  }

  extractMetadataMessage(
    records: ProcessDocumentsCommandRecord[],
    processedKeys: Map<string, string>,
  ): Array<{ key: string; value: string }> {
    return records.map((record) => {
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
    });
  }

  async handle(command: ProcessDocumentsCommand): Promise<void> {
    let filesRecordsMap: Map<string, RecordFileData>;
    try {
      filesRecordsMap = await this.getRecordsFiles(command.records);
    } catch (error) {
      this.logger.error(error, "Failed to get records files");
      return;
    }

    try {
      await this.extractMetadata(filesRecordsMap);
    } catch (error) {
      this.logger.error(error, "Failed to extract metadata");
    }

    try {
      const pdfContentType = "application/pdf";
      const processedKeys = new Map<string, string>();

      for (const [recordId, recordFileData] of filesRecordsMap) {
        const fileNameData = parse(recordFileData.file.key);
        let processedKey = `pdfs/${fileNameData.name}.pdf`;
        processedKeys.set(recordId, processedKey);

        this.logger.info({ type: recordFileData.file.contentType }, "Type");

        try {
          let bytes: Uint8Array;
          if (recordFileData.file.contentType === "application/pdf") {
            bytes = recordFileData.file.bytes;
          } else if (
            recordFileData.file.contentType ===
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ) {
            const id = uuidv4();
            const originalTmpFile = `/tmp/${id}.docx`;
            const convertedTmpFile = `/tmp/${id}.pdf`;

            await writeFile(originalTmpFile, Buffer.from(recordFileData.file.bytes));
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
            this.logger.error({ contentType: recordFileData.file.contentType }, "Unsupported file type");
            continue;
          }

          await this.processedRecordsFileStorageClient.saveFile(processedKey, bytes, pdfContentType);
          await this.supervisoryRecordsRepository.updateProcessedKey(recordId, processedKey);
        } catch (error) {
          this.logger.error(error, `Failed to process record ${recordId}`);
        }
      }

      const warrantyTextExtractMetadata = this.extractMetadataMessage(
        command.records.filter((record) => record.application === Application.WARRANTY),
        processedKeys,
      );

      const letterTextExtractMetadata = this.extractMetadataMessage(
        command.records.filter((record) => record.application === Application.LETTER),
        processedKeys,
      );

      this.logger.info(
        {
          warranty: warrantyTextExtractMetadata.length,
          letter: letterTextExtractMetadata.length,
        },
        "Sending events",
      );

      if (warrantyTextExtractMetadata.length > 0) {
        await this.eventProducerClient.sendEvents([
          {
            topic: NotificationType.InsertWarrantyMetadata,
            messages: warrantyTextExtractMetadata,
          },
        ]);
      }

      if (letterTextExtractMetadata.length > 0) {
        await this.eventProducerClient.sendEvents([
          {
            topic: NotificationType.InsertLetterMetadata,
            messages: letterTextExtractMetadata,
          },
        ]);
      }
    } catch (error) {
      this.logger.error(error, `Failed to process for records`);
    }
  }
}
