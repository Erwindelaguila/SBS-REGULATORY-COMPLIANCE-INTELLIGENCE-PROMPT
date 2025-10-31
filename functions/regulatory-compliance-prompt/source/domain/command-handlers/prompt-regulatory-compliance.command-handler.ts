import { Logger } from "pino";
import { AIChatClient, FileData } from "../ports/ai-chat.client";
import { FileStorageClient } from "../ports/file-storage.client";
import { SystemPromptsRepository } from "../ports/system-prompts.repository";
import { PromptRegulatoryComplianceCommand } from "../commands/prompt-regulatory-compliance.command";
import { PassThrough, Readable, Transform } from "stream";
import { DocumentType } from "../models/document-type";
import { SourceProcessRepository } from "../ports/source_process.repository";
import { SystemPrompt } from "../models/supervisory-record.model";

export interface PromptRegComplCommandHandlerOutput {
  result: Readable;
  fileKeys: string[];
}

export class PromptRegulatoryComplianceCommandHandler {
  private readonly DELIMITER: string = "###---###";

  constructor(
    private readonly documentsFileStorageClient: FileStorageClient,
    private readonly documentsFileStorageClientForLetterAnalysis: FileStorageClient,
    private readonly documentsFileStorageClientForWarrantyAnalysis: FileStorageClient,
    private readonly csvFileStorageClient: FileStorageClient,
    private readonly systemPromptsRepository: SystemPromptsRepository,
    private readonly sourceProcessLetterAnalysisRepository: SourceProcessRepository,
    private readonly sourceProcessWarrantyRepository: SourceProcessRepository,
    private readonly aiChatClient: AIChatClient,
    private readonly saveCSVFlag: boolean,
    private readonly logger: Logger,
  ) {}

  private filterNotUserMessages(): Transform {
    let temporalConcatenatedChunks = "";
    let userMessageEnded = false;
    const DELIMITER = this.DELIMITER;

    return new Transform({
      transform(chunk, encoding, callback) {
        if (userMessageEnded) {
          callback(null);
          return;
        }

        const value = Buffer.from(chunk).toString();
        temporalConcatenatedChunks += value;

        // console.log({ value, temporalConcatenatedChunks }, "Chunk");

        const firstNumeralIndex = temporalConcatenatedChunks.indexOf("#");
        if (firstNumeralIndex === -1) {
          callback(null, Buffer.from(temporalConcatenatedChunks));
          temporalConcatenatedChunks = "";
          return;
        }

        if (firstNumeralIndex !== 0) {
          const value = temporalConcatenatedChunks.slice(0, firstNumeralIndex);
          temporalConcatenatedChunks = temporalConcatenatedChunks.slice(firstNumeralIndex);
          callback(null, Buffer.from(value));
          return;
        }

        const delimiterSubString = temporalConcatenatedChunks.slice(firstNumeralIndex, DELIMITER.length);
        if (delimiterSubString.length < DELIMITER.length) {
          callback(null, Buffer.from(temporalConcatenatedChunks.slice(0, firstNumeralIndex)));
          temporalConcatenatedChunks = temporalConcatenatedChunks.slice(firstNumeralIndex);
          return;
        }

        let lastValidIndex = 0;
        const isValid = delimiterSubString.split("").every((char, index) => {
          const result = char === DELIMITER[index];
          lastValidIndex = result ? index : lastValidIndex;
          return result;
        });

        if (!isValid) {
          callback(null, Buffer.from(temporalConcatenatedChunks.slice(0, lastValidIndex + 1)));
          temporalConcatenatedChunks = temporalConcatenatedChunks.slice(lastValidIndex + 1);
          return;
        }

        userMessageEnded = true;
        callback(null);
      },
    });
  }

  private async saveCsv(value: string, documentName: string) {
    this.logger.debug(`Saving CSV file with name: ${documentName}`);
    await this.csvFileStorageClient.uploadFile(documentName, new TextEncoder().encode(value), "text/csv");
    this.logger.debug("CSV file saved");
  }

  private readData(messageId: string): PassThrough {
    let resultString = "";

    const stream = new PassThrough();
    stream.on("data", (chunk: string) => {
      if (chunk) {
        resultString += chunk.toString();
      }
    });

    stream.on("end", async () => {
      this.logger.debug({ resultString }, "Read data");
      if (!this.saveCSVFlag) {
        return;
      }

      const values = resultString.split(this.DELIMITER);
      values.shift();

      const results = await Promise.allSettled(
        values.map(async (value, index) => {
          let documentName = "";
          switch (index) {
            case 0:
              documentName = `summary/csv-result-${messageId}.csv`;
              break;
            case 1:
              documentName = `pdf-highlights/csv-result-${messageId}.csv`;
              break;
            default:
              documentName = `default/csv-result-${messageId}.csv`;
              break;
          }
          return this.saveCsv(value.trim(), documentName);
        }),
      );

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          this.logger.debug({ result }, "CSV saved");
        } else {
          this.logger.error({ result }, "Failed to save CSV");
        }
      });
    });

    stream.on("error", (error) => {
      this.logger.error({ error }, "Failed to read data");
    });

    return stream;
  }
  private async handleDocumentLoad(
    command: PromptRegulatoryComplianceCommand,
  ): Promise<PromptRegComplCommandHandlerOutput> {
    try {
      // Get system prompts
      const systemPrompts = await this.systemPromptsRepository.getSystemPrompt(
        command.application,
        DocumentType.DEFAULT,
      );

      let systemPrompt = "";
      if (systemPrompts.length > 0) {
        systemPrompt = systemPrompts[0].prompt;
        this.logger.info({ systemPrompt: systemPrompts[0].id }, "System prompt");
      }

      // Get files by keys
      const filesData = await this.documentsFileStorageClient.getFilesByKey(command.recordKeys);
      this.logger.info(
        {
          filesData: filesData.map((file) => ({
            key: file.key,
            bytes: file.bytes.length,
            contentType: file.contentType,
          })),
        },
        "Files data",
      );

      // Get AI chat response
      const chatResponse = await this.aiChatClient.getChatResponse(systemPrompt, command.question, filesData);
      const processedResponse = new PassThrough();

      chatResponse.pipe(this.readData(command.messageId)).pipe(this.filterNotUserMessages()).pipe(processedResponse);

      return {
        result: processedResponse,
        fileKeys: command.recordKeys, // Assuming we return the same keys as part of the response
      };
    } catch (err) {
      // TODO: Handle specific errors and their codes
      if (err instanceof Error) {
        this.logger.error({ err }, "Failed to handle PromptRegulatoryComplianceCommand");
      }
      throw err;
    }
  }

  private solveBigJsonFile(filesData: FileData[]): FileData[] {
    return filesData.map((file) => {
      try {
        // Decodificar bytes a texto y parsear JSON
        const jsonText = new TextDecoder().decode(file.bytes);
        const json = JSON.parse(jsonText);

        // Si es objeto con listas top-level, cortar cada una
        const reduced: any = {};
        if (json && typeof json === "object") {
          for (const [key, value] of Object.entries(json)) {
            reduced[key] = Array.isArray(value) ? value.slice(0, 100) : value;
          }
        }

        // Volver a bytes el nuevo JSON reducido
        const reducedText = JSON.stringify(reduced);
        const reducedBytes = new TextEncoder().encode(reducedText);

        return {
          key: file.key.replace(/(\.[^.]+)?$/, "_sampled.json"),
          bytes: reducedBytes,
          contentType: "application/json",
        } as FileData;
      } catch (error) {
        this.logger.warn({ key: file.key, error }, "No se pudo procesar el archivo JSON");
        // si falla, devolvemos el original
        return file;
      }
    });
  }

  private async handleWarranty(
    command: PromptRegulatoryComplianceCommand,
  ): Promise<PromptRegComplCommandHandlerOutput> {
    try {
      // Get system prompts
      const systemPrompts: Array<SystemPrompt> = [
        {
          id: "1",
          prompt:
            "Dado el siguiente conjunto de datos realiza una análisis sobre las consultas del usuario usando únicamente estos documentos como información",
          version: "1",
          type: "1",
          createdAt: "19/10/2025",
          updatedAt: "19/10/2025",
        },
      ];

      let systemPrompt = "";
      if (systemPrompts.length > 0) {
        systemPrompt = systemPrompts[0].prompt;
        this.logger.info({ systemPrompt: systemPrompts[0].id }, "System prompt");
      }

      // Get sources from dynamo
      const sources = await this.sourceProcessWarrantyRepository.getSources(command.recordKeys, command.application);

      if (sources.length == 0) {
        throw new Error("No se encuentra sources que puedan llamar a un archivo");
      }

      // Get files by keys
      const filesData: FileData[] = await this.documentsFileStorageClientForWarrantyAnalysis.getFilesByKey(sources);
      this.logger.info(
        {
          filesData: filesData.map((file) => ({
            key: file.key,
            bytes: file.bytes.length,
            contentType: file.contentType,
          })),
        },
        "Files data",
      );
      const reducedFilesData: FileData[] = this.solveBigJsonFile(filesData);

      // Get AI chat response
      const chatResponse = await this.aiChatClient.getChatResponse(systemPrompt, command.question, reducedFilesData);
      const processedResponse = new PassThrough();

      chatResponse.pipe(this.readData(command.messageId)).pipe(this.filterNotUserMessages()).pipe(processedResponse);
      return {
        result: processedResponse,
        fileKeys: command.recordKeys, // Assuming we return the same keys as part of the response
      };
    } catch (err) {
      // TODO: Handle specific errors and their codes
      if (err instanceof Error) {
        this.logger.error({ err }, "Failed to handle PromptRegulatoryComplianceCommand");
      }
      throw err;
    }
  }

  private async handleLetter(command: PromptRegulatoryComplianceCommand): Promise<PromptRegComplCommandHandlerOutput> {
    try {
      // Get system prompts

      const systemPrompts = await this.systemPromptsRepository.getSystemPrompt(command.application, "DEFAULT");
      let systemPrompt = "";
      if (systemPrompts.length > 0) {
        systemPrompt = systemPrompts[0].prompt;
        this.logger.info({ systemPrompt: systemPrompts[0].id }, "System prompt");
      }

      this.logger.debug({ systemPrompt }, "System prompt");
      // Get sources from dynamo
      const sources = await this.sourceProcessLetterAnalysisRepository.getSources(
        command.recordKeys,
        command.application,
      );

      if (sources.length == 0) {
        throw new Error("No se encuentra sources que puedan llamar a un archivo");
      }

      // Get files by keys
      const filesData = await this.documentsFileStorageClientForLetterAnalysis.getFilesByKey(sources);
      this.logger.info(
        {
          filesData: filesData.map((file) => ({
            key: file.key,
            bytes: file.bytes.length,
            contentType: file.contentType,
          })),
        },
        "Files data",
      );

      // Get AI chat response
      const chatResponse = await this.aiChatClient.getChatResponse(systemPrompt, command.question, filesData);
      const processedResponse = new PassThrough();

      chatResponse.pipe(this.readData(command.messageId)).pipe(this.filterNotUserMessages()).pipe(processedResponse);

      /*   return {
                   result: processedResponse,
                   fileKeys: command.recordKeys, // Assuming we return the same keys as part of the response
               };*/
      return {
        result: processedResponse,
        fileKeys: command.recordKeys, // Assuming we return the same keys as part of the response
      };
    } catch (err) {
      // TODO: Handle specific errors and their codes
      if (err instanceof Error) {
        this.logger.error({ err }, "Failed to handle PromptRegulatoryComplianceCommand");
      }
      throw err;
    }
  }

  async handle(command: PromptRegulatoryComplianceCommand): Promise<PromptRegComplCommandHandlerOutput> {
    switch (command.application) {
      case "LETTER":
        return this.handleLetter(command);
      case "WARRANTY":
        return this.handleWarranty(command);
      case "DOCUMENT_LOAD":
      default:
        return this.handleDocumentLoad(command);
    }
  }
}
