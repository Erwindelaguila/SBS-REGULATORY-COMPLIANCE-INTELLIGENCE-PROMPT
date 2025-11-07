import { Logger } from "pino";
import { AIChatClient, FileData } from "../ports/ai-chat.client";
import { FileStorageClient } from "../ports/file-storage.client";
import { SystemPromptsRepository } from "../ports/system-prompts.repository";
import { PromptRegulatoryComplianceCommand, ConversationMessage } from "../commands/prompt-regulatory-compliance.command";
import { PassThrough, Readable, Transform } from "stream";
import { DocumentType } from "../models/document-type";
import { SourceProcessRepository } from "../ports/source_process.repository";
import { SystemPrompt } from "../models/supervisory-record.model";
import { MOCK_PROMPTS } from "../mocks/mock-prompts";

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

  /**
   * Detects if the user wants to generate a document based on keywords in the question
   * @param question - The user's question
   * @returns true if document generation is requested, false otherwise
   */
  private detectDocumentGenerationIntent(question: string): boolean {
    const keywords = [
      'genera',
      'generar',
      'crear documento',
      'crear observación',
      'crear observacion',
      'observación preliminar',
      'observacion preliminar',
      'documento preliminar',
      'generar word',
      'word',
      'documento de observación',
      'documento de observacion',
    ];

    const lowerQuestion = question.toLowerCase();
    return keywords.some(keyword => lowerQuestion.includes(keyword));
  }

  /**
   * Detects if the user wants to modify the previously generated document
   * @param question - The user's question
   * @returns true if modification is requested, false otherwise
   */
  private detectModificationIntent(question: string): boolean {
    const modificationKeywords = [
      'cambia',
      'cambiar',
      'modifica',
      'modificar',
      'actualiza',
      'actualizar',
      'ajusta',
      'ajustar',
      'corrige',
      'corrigir',
      'edita',
      'editar',
      'reemplaza',
      'reemplazar',
    ];

    const lowerQuestion = question.toLowerCase();
    return modificationKeywords.some(keyword => lowerQuestion.includes(keyword));
  }

  /**
   * Extracts the last generated Markdown document from conversation history
   * @param conversationHistory - The conversation history
   * @returns The last Markdown document found in assistant responses, or null if none found
   */
  private extractPreviousDocumentMarkdown(conversationHistory: ConversationMessage[]): string | null {
    // Search backwards through conversation history for assistant responses
    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const message = conversationHistory[i];
      
      if (message.role === 'assistant') {
        const content = message.content.trim();
        
        // Check if it looks like our Markdown document structure
        // Look for key indicators: title with #, metadata with **, sections
        const hasTitle = content.match(/^#\s+.+$/m);
        const hasMetadata = content.match(/\*\*Entidad:\*\*/i) || content.match(/\*\*Período:\*\*/i);
        const hasHallazgos = content.match(/##\s+Hallazgos/i);
        const hasAnexos = content.match(/##\s+Anexos/i);
        
        // If it has title + metadata or typical document sections, consider it a document
        if ((hasTitle && hasMetadata) || hasHallazgos || hasAnexos) {
          this.logger.info('📄 Found previous Markdown document in conversation history');
          return content;
        }
      }
    }
    
    this.logger.info('📭 No previous Markdown document found in conversation history');
    return null;
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
      // Detect if user wants to generate a document
      const isDocumentGeneration = this.detectDocumentGenerationIntent(command.question);
      
      // Detect if user wants to modify a previous document
      const isModification = this.detectModificationIntent(command.question);
      
      // Extract previous Markdown if it exists (for modifications)
      const previousMarkdown = isModification ? this.extractPreviousDocumentMarkdown(command.conversationHistory) : null;
      
      // Select appropriate prompt based on intent
      const systemPrompt = isDocumentGeneration 
        ? MOCK_PROMPTS.WARRANTY_DOCUMENT_GENERATOR
        : MOCK_PROMPTS.WARRANTY_DEFAULT;
      
      // Build the question with context if modifying
      let enhancedQuestion = command.question;
      if (isModification && previousMarkdown) {
        enhancedQuestion = `DOCUMENTO PREVIO EN MARKDOWN:
${previousMarkdown}

INSTRUCCIÓN DE MODIFICACIÓN:
${command.question}

Por favor, modifica el documento previo según la instrucción. Mantén toda la estructura Markdown y solo actualiza lo solicitado.`;
        
        this.logger.info({
          isModification: true,
          hasPreviousMarkdown: true,
          originalQuestionLength: command.question.length,
          enhancedQuestionLength: enhancedQuestion.length
        }, "🔄 Modification mode activated with previous Markdown context");
      } else if (isModification && !previousMarkdown) {
        this.logger.warn({
          isModification: true,
          hasPreviousMarkdown: false,
        }, "⚠️ Modification requested but no previous Markdown found in history");
      }
      
      this.logger.info({ 
        isDocumentGeneration, 
        isModification,
        hasPreviousMarkdown: !!previousMarkdown,
        promptType: isDocumentGeneration ? 'DOCUMENT_GENERATOR' : 'DEFAULT',
        questionLength: enhancedQuestion.length
      }, "System prompt selected for WARRANTY");

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

      // Log para debugging: ver qué datos tiene el análisis
      this.logger.info({
        totalFiles: reducedFilesData.length,
        firstFileSample: reducedFilesData[0] ? {
          key: reducedFilesData[0].key,
          contentPreview: new TextDecoder().decode(reducedFilesData[0].bytes).substring(0, 500)
        } : null
      }, "📊 Data being sent to AI for document generation");

      // Get AI chat response with enhanced question (includes previous JSON if modifying)
      const chatResponse = await this.aiChatClient.getChatResponse(systemPrompt, enhancedQuestion, reducedFilesData);
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
