import { Logger } from "pino";
import { chunk } from "../../utils";
import {
  MetadataInsertionPromptCommand,
  MetadataInsertionPromptCommandRecord,
} from "../commands/metadata-insertion-prompt.command";
import { AIChatClient, RecordData, RecordMetadata } from "../ports/ai-chat.client";
import { FileData, FileStorageClient } from "../ports/file-storage.client";
import { QueueClient, QueueMessage } from "../ports/queue.client";
import { SupervisoryRecordsRepository } from "../ports/supervisory-records.repository";

import { v4 as uuid } from "uuid";
import { NotificationType } from "../model/notification-type";
import { SystemPromptsRepository } from "../ports/system-prompts-repository";
import { Application } from "../model/application";
import { DocumentType } from "../model/document-type";
import { SystemPrompt } from "../model/system-prompt";
import { PromptType } from "../model/prompt-type";

export class MetadataInsertionPromptCommandHandler {
  private readonly prompt =
    'Debes responder con una cadena JSON válida, lista para usarse directamente como parámetro de la función JSON.parse() de Node.js. Tu respuesta debe ser solo una cadena JSON, sin ningún texto adicional, sin comentarios, sin saltos de línea, y sin formato de bloque de código (por ejemplo, no incluyas ```json). La estructura debe ser siempre un arreglo de objetos. Nunca devuelvas un objeto único o estructuras anidadas. Cada objeto debe tener la siguiente estructura: {"metadata": {/* claves y valores concretos y planos */}, "recordId": "nombre_del_archivo.pdf"}. Todos los valores deben ser cadenas planas, usando solo caracteres ASCII. No uses comillas curvas (“ ”), guiones largos (–), ni saltos de línea. Usa solo comillas dobles ("), guiones normales (-) y texto plano. La salida debe estar completamente en una sola línea. Ejemplo de formato correcto: [{"metadata":{"clave":"valor"},"recordId":"archivo.pdf"}]. Recuerda: responde únicamente con el arreglo JSON, en una sola línea. Nada más.';

  constructor(
    private readonly aiChatClient: AIChatClient,
    private readonly fileStorageClient: FileStorageClient,
    private readonly queueClient: QueueClient,
    private readonly systemPromptsRepository: SystemPromptsRepository,
    private readonly supervisoryRecordsRepository: SupervisoryRecordsRepository,
    private readonly logger: Logger,
  ) {}

  async getRecordsFiles(records: MetadataInsertionPromptCommandRecord[]) {
    const filesResults = await Promise.allSettled(
      records.map(async (record) => {
        const file = await this.fileStorageClient.getFileByKey(record.key);
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

  async getRecordsByApplicationAndDocumentType(
    records: MetadataInsertionPromptCommandRecord[],
    filesByRecord: Map<string, FileData>,
  ) {
    const recordsByApplicationAndDocumentType = new Map<Application, Map<DocumentType, RecordData[]>>();

    records.forEach(async (record) => {
      const file = filesByRecord.get(record.recordId)!;
      if (file === undefined) {
        return;
      }

      const recordData: RecordData = {
        recordId: record.recordId,
        key: record.key,
        bytes: file.bytes,
        contentType: file.contentType,
      };

      if (!recordsByApplicationAndDocumentType.has(record.application)) {
        const map = new Map<DocumentType, RecordData[]>();
        map.set(record.documentType, [recordData]);

        recordsByApplicationAndDocumentType.set(record.application, map);
      } else {
        const recordsByDocumentType = recordsByApplicationAndDocumentType.get(record.application)!;
        if (!recordsByDocumentType.has(record.documentType)) {
          recordsByDocumentType.set(record.documentType, [recordData]);
        } else {
          recordsByDocumentType.get(record.documentType)!.push(recordData);
        }
      }
    });

    return recordsByApplicationAndDocumentType;
  }

  async handle(command: MetadataInsertionPromptCommand): Promise<void> {
    try {
      let filesMetadata: RecordMetadata[] = [];

      const filesRecordsMap = await this.getRecordsFiles(command.records);
      const recordsMap = await this.getRecordsByApplicationAndDocumentType(command.records, filesRecordsMap);
      const systemPrompts = new Map<Application, Map<DocumentType, SystemPrompt>>();

      for (const [application, recordsByDocumentTypes] of recordsMap) {
        this.logger.info(`Processing application: ${application}`);

        for (const [documentType, records] of recordsByDocumentTypes) {
          this.logger.info(`Processing documents ${documentType}`);

          let systemPrompt: SystemPrompt;
          if (!systemPrompts.has(application)) {
            systemPrompt = await this.systemPromptsRepository.getSystemPromptByApplicationAndDocumentTypeAndPromptType(
              application,
              documentType,
              PromptType.METADATA,
            );
            const map = new Map<DocumentType, SystemPrompt>();
            map.set(documentType, systemPrompt);
            systemPrompts.set(application, map);
          } else {
            if (!systemPrompts.get(application)!.has(documentType)) {
              systemPrompt =
                await this.systemPromptsRepository.getSystemPromptByApplicationAndDocumentTypeAndPromptType(
                  application,
                  documentType,
                  PromptType.METADATA,
                );
              systemPrompts.get(application)!.set(documentType, systemPrompt);
            } else {
              systemPrompt = systemPrompts.get(application)!.get(documentType)!;
            }
          }

          const batches = chunk(records, 5);
          for (const batch of batches) {
            const fileMetadata = await this.aiChatClient.generateMetadata(this.prompt, systemPrompt.prompt, batch);
            filesMetadata = filesMetadata.concat(fileMetadata);
          }

          this.logger.debug({ filesMetadata }, "Files metadata");
        }
      }

      const results = await Promise.allSettled(
        filesMetadata.map(async (fileMetadata) => {
          const record = command.records.find((record) => record.recordId === fileMetadata.recordId)!;
          await this.supervisoryRecordsRepository.updateMetadata(fileMetadata.recordId, {
            ...record.metadata,
            ...fileMetadata.metadata,
          });
          return {
            recordId: record.recordId,
            parentId: record.parentId,
            sessionId: record.sessionId,
          };
        }),
      );

      const successResults = results
        .filter((result) => result.status === "fulfilled")
        .map<QueueMessage>((result) => ({
          id: uuid(),
          message: {
            sessionId: result.value.sessionId,
            type: NotificationType.InsertMetadata,
            data: {
              recordId: result.value.recordId,
              parentId: result.value.parentId,
            },
          },
        }));

      this.logger.info({ successResults }, "Successful results");
      await this.queueClient.sendMessages(successResults);

      this.logger.debug(
        {
          records: command.records.map((record) => record.recordId),
        },
        "Updated metadata for records",
      );
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Failed to update metadata for records: ${error.message}`);
      }
      throw error;
    }
  }
}
