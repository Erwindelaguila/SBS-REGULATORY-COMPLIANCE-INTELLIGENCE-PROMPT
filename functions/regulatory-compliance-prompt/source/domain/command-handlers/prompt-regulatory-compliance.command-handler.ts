import { Logger } from "pino";
import { AIChatClient, FileData } from "../ports/ai-chat.client";
import { FileStorageClient } from "../ports/file-storage.client";
import { SystemPromptsRepository } from "../ports/system-prompts.repository";
import { PromptRegulatoryComplianceCommand, ConversationMessage } from "../commands/prompt-regulatory-compliance.command";
import { PassThrough, Readable, Transform } from "stream";
import { DocumentType } from "../models/document-type";
import { SourceProcessRepository } from "../ports/source_process.repository";
import { SupervisoryRecordsRepository } from "../ports/supervisory-records.repository";


export interface PromptRegComplCommandHandlerOutput {
  result: Readable;
  fileKeys: string[];
  isDocumentGenerated?: boolean; 
  documentType?: 'WARRANTY' | 'LETTER' | 'SUBORDINATED_DEBT'; 
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
    private readonly subordinatedDebtSourceProcessRepository: SourceProcessRepository,
    private readonly subordinatedDebtAnalysisFileStorageClient: FileStorageClient,
    private readonly supervisoryRecordsRepository: SupervisoryRecordsRepository,
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


  private extractPreviousDocumentMarkdown(conversationHistory: ConversationMessage[]): string | null {

    for (let i = conversationHistory.length - 1; i >= 0; i--) {
      const message = conversationHistory[i];
      
      if (message.role === 'assistant') {
        const content = message.content.trim();
        

        const hasTitle = content.match(/^#\s+.+$/m);
        const hasMetadata = content.match(/\*\*Entidad:\*\*/i) || content.match(/\*\*Período:\*\*/i);
        const hasHallazgos = content.match(/##\s+Hallazgos/i);
        const hasAnexos = content.match(/##\s+Anexos/i);
        
        if ((hasTitle && hasMetadata) || hasHallazgos || hasAnexos) {
          this.logger.info('Found previous Markdown document in conversation history');
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

      const isDocumentGeneration = this.detectDocumentGenerationIntent(command.question);
      const isModification = this.detectModificationIntent(command.question);
      const previousMarkdown = isModification ? this.extractPreviousDocumentMarkdown(command.conversationHistory) : null;
      const promptType = isDocumentGeneration ? "DOCUMENT_GENERATOR" : "CHAT";
      const documentType = command.application || "WARRANTY";
      

      const systemPrompts = await this.systemPromptsRepository.getSystemPromptByType(
        "SUPTECH",          
        documentType,       
        promptType          
      );
      
      if (systemPrompts.length === 0) {
        const errorMsg = `No ${documentType} prompt found in DynamoDB for promptType: ${promptType}. Please check that prompts are inserted in DynamoDB.`;
        this.logger.error({ 
          promptType,
          application: "SUPTECH",
          documentType
        }, errorMsg);
        throw new Error(errorMsg);
      }
      
      const systemPrompt = systemPrompts[0].prompt;
      this.logger.info({ 
        systemPromptId: systemPrompts[0].id,
        promptType,
        documentType,
        version: systemPrompts[0].version,
        promptLength: systemPrompt.length
      }, `System prompt loaded from DynamoDB for ${documentType}`);
      

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
        }, "Modification mode activated with previous Markdown context");
      } else if (isModification && !previousMarkdown) {
        this.logger.warn({
          isModification: true,
          hasPreviousMarkdown: false,
        }, "Modification requested but no previous Markdown found in history");
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

  
      this.logger.info({
        totalFiles: reducedFilesData.length,
        firstFileSample: reducedFilesData[0] ? {
          key: reducedFilesData[0].key,
          contentPreview: new TextDecoder().decode(reducedFilesData[0].bytes).substring(0, 500)
        } : null
      }, "Data being sent to AI for document generation");

      const chatResponse = await this.aiChatClient.getChatResponse(systemPrompt, enhancedQuestion, reducedFilesData);
      const processedResponse = new PassThrough();


      if (isDocumentGeneration) {
        chatResponse.pipe(processedResponse);
      } else {
        chatResponse.pipe(this.readData(command.messageId)).pipe(this.filterNotUserMessages()).pipe(processedResponse);
      }

      return {
        result: processedResponse,
        fileKeys: command.recordKeys,
        isDocumentGenerated: isDocumentGeneration, 
        documentType: 'WARRANTY'  
      };
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error({ err }, "Failed to handle PromptRegulatoryComplianceCommand");
      }
      throw err;
    }
  }

  private async handleLetter(command: PromptRegulatoryComplianceCommand): Promise<PromptRegComplCommandHandlerOutput> {
    try {

      const isDocumentGeneration = this.detectDocumentGenerationIntent(command.question);
      const isModification = this.detectModificationIntent(command.question);
      const previousMarkdown = isModification ? this.extractPreviousDocumentMarkdown(command.conversationHistory) : null;
      const promptType = isDocumentGeneration ? "DOCUMENT_GENERATOR" : "CHAT";
      const documentType = "LETTER";
    
      const systemPrompts = await this.systemPromptsRepository.getSystemPromptByType(
        "SUPTECH",
        documentType,
        promptType
      );
      
      if (systemPrompts.length === 0) {
        const errorMsg = `No ${documentType} prompt found in DynamoDB for promptType: ${promptType}. Please check that prompts are inserted in DynamoDB.`;
        this.logger.error({ 
          promptType,
          application: "SUPTECH",
          documentType
        }, errorMsg);
        throw new Error(errorMsg);
      }
      
      const systemPrompt = systemPrompts[0].prompt;
      this.logger.info({ 
        systemPromptId: systemPrompts[0].id,
        promptType,
        documentType,
        version: systemPrompts[0].version,
        promptLength: systemPrompt.length
      }, `System prompt loaded from DynamoDB for ${documentType}`);
      

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
        }, "Modification mode activated with previous Markdown context");
      } else if (isModification && !previousMarkdown) {
        this.logger.warn({ isModification: true, hasPreviousMarkdown: false }, 
          "User requested modification but no previous document found in history");
      }

      this.logger.debug({ systemPrompt }, "System prompt");
      

      const sources = await this.sourceProcessLetterAnalysisRepository.getSources(
        command.recordKeys,
        command.application,
      );

      if (sources.length == 0) {
        throw new Error("No se encuentra sources que puedan llamar a un archivo");
      }

 
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

      const chatResponse = await this.aiChatClient.getChatResponse(systemPrompt, enhancedQuestion, filesData);
      const processedResponse = new PassThrough();

      chatResponse.pipe(this.readData(command.messageId)).pipe(this.filterNotUserMessages()).pipe(processedResponse);

      return {
        result: processedResponse,
        fileKeys: command.recordKeys,
        isDocumentGenerated: isDocumentGeneration,
        documentType: isDocumentGeneration ? documentType : undefined,
      };
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error({ err }, "Failed to handle PromptRegulatoryComplianceCommand");
      }
      throw err;
    }
  }

  private async handleSubordinatedDebt(
    command: PromptRegulatoryComplianceCommand,
  ): Promise<PromptRegComplCommandHandlerOutput> {
    try {
      this.logger.info(
        { recordKeys: command.recordKeys, question: command.question },
        "Handling subordinated debt compliance query",
      );

      // Detectar si el usuario pide reporte de criterios
      const isReportRequest = this.detectSubordinatedDebtReportRequest(command.question);

      if (isReportRequest) {
        this.logger.info("Detected subordinated debt report request - generating criteria table");
        return await this.generateSubordinatedDebtReport(command);
      }

      // Si no es reporte, usar chat normal con el análisis como contexto
      return await this.handleSubordinatedDebtChat(command);
    } catch (err) {
      this.logger.error(err, "Failed to handle subordinated debt");
      if (err instanceof Error) {
        this.logger.error({ err }, "Failed to handle subordinated debt");
      }
      throw err;
    }
  }

  private detectSubordinatedDebtReportRequest(question: string): boolean {
    const reportKeywords = [
      'reporte',
      'criterios',
      'cumplimiento',
      'tabla',
      'resultados',
      'análisis',
      'analisis',
      'resumen',
      'dame el reporte',
      'muestra criterios',
      'ver criterios',
    ];

    const lowerQuestion = question.toLowerCase();
    return reportKeywords.some(keyword => lowerQuestion.includes(keyword));
  }

  private async generateSubordinatedDebtReport(
    command: PromptRegulatoryComplianceCommand,
  ): Promise<PromptRegComplCommandHandlerOutput> {
    try {
      // Obtener el recordKey del primer documento (debería haber solo 1)
      const recordKey = command.recordKeys[0];
      
      // Mapear filename a S3 key usando el repository
      const sources = await this.subordinatedDebtSourceProcessRepository.getSources([recordKey], "SUBORDINATED_DEBT");
      if (sources.length === 0) {
        throw new Error(`No analysis found for record ${recordKey}`);
      }
      const analysisKey = sources[0];
      this.logger.info({ analysisKey }, "Reading subordinated debt analysis from S3");
      
      const analysisFiles = await this.subordinatedDebtAnalysisFileStorageClient.getFilesByKey([analysisKey]);
      
      if (analysisFiles.length === 0) {
        throw new Error(`No analysis found for record ${recordKey}`);
      }

      const analysisJson = JSON.parse(Buffer.from(analysisFiles[0].bytes).toString('utf-8'));
      const criterios = analysisJson.criterios;

      // Ordenar criterios por ID (1, 2, 2a, 2b, 3, 3a, 3b, etc.)
      criterios.sort((a: any, b: any) => {
        const parseId = (id: string) => {
          const match = id.match(/^(\d+)([a-z]?)$/);
          if (!match) return { num: 0, letter: '' };
          return { num: parseInt(match[1]), letter: match[2] };
        };
        
        const aId = parseId(a.id);
        const bId = parseId(b.id);
        
        if (aId.num !== bId.num) return aId.num - bId.num;
        return aId.letter.localeCompare(bId.letter);
      });

      this.logger.info({ criteriaCount: criterios.length }, "Loaded criteria results");

     
      const record = await this.supervisoryRecordsRepository.getRecordById(recordKey);
      const fileName = record.key; 

      // Generar tabla markdown
      let markdown = `# Reporte de Cumplimiento - Deuda Subordinada\n\n`;
      markdown += `**Documento analizado:** ${fileName}\n\n`;
      markdown += `## Tabla de Resultados de Criterios Regulatorios\n\n`;
      markdown += `| N° | Basilea III | Resolución SBS N° 3950-2022 | Contrato | Cumplimiento |\n`;
      markdown += `|----|-------------|----------------------------|----------|-------------|\n`;

      for (const criterio of criterios) {
        const cumplimientoText = criterio.cumplimiento === "Cumple" 
          ? "Cumple" 
          : `${criterio.cumplimiento}: ${criterio.justificacion}`;
        
        // Función para limpiar texto: escapar pipes y eliminar saltos de línea
        const cleanForTable = (str: string) => str.replace(/\|/g, '\\|').replace(/\n/g, ' ');
        
        // Aplicar bold y limpiar
        const basileaFormatted = cleanForTable(this.boldClauseNumber(criterio.basilea));
        const resolucionFormatted = cleanForTable(this.boldClauseNumber(criterio.resolucion_sbs));
        const contratoFormatted = cleanForTable(this.boldClauseNumber(criterio.contrato));
        const cumplimientoFormatted = cleanForTable(cumplimientoText);
        
        markdown += `| ${criterio.id} | ${basileaFormatted} | ${resolucionFormatted} | ${contratoFormatted} | ${cumplimientoFormatted} |\n`;
      }

      markdown += `\n---\n\n`;
      markdown += `**tabla de resultados**\n\n`; 
      markdown += `Para descargar este reporte en formato Excel, haz clic en el botón "Descargar Excel" que aparece arriba.`;

      // Retornar como stream
      const responseStream = new PassThrough();
      responseStream.write(markdown);
      responseStream.end();

      return {
        result: responseStream,
        fileKeys: [analysisKey],
        isDocumentGenerated: false,
        documentType: 'SUBORDINATED_DEBT'
      };
    } catch (err) {
      this.logger.error(err, "Failed to generate subordinated debt report");
      throw err;
    }
  }

  private async handleSubordinatedDebtChat(
    command: PromptRegulatoryComplianceCommand,
  ): Promise<PromptRegComplCommandHandlerOutput> {
    try {
      const recordKey = command.recordKeys[0];
      const sources = await this.subordinatedDebtSourceProcessRepository.getSources([recordKey], "SUBORDINATED_DEBT");
      if (sources.length === 0) {
        throw new Error(`No analysis found for record ${recordKey}`);
      }
      const analysisKey = sources[0];
      
      const analysisFiles = await this.subordinatedDebtAnalysisFileStorageClient.getFilesByKey([analysisKey]);
      
      const systemPrompt = `Eres un experto en análisis de cumplimiento regulatorio de instrumentos de deuda subordinada según normativa de Basilea III y la Resolución SBS Nº 3950-2022.

Tienes acceso al análisis completo de cumplimiento de criterios regulatorios del contrato de deuda subordinada. Responde preguntas específicas sobre el documento, criterios de cumplimiento, y proporciona explicaciones claras.

Si el usuario pide un "reporte" o "tabla de criterios", indícale que puede solicitarlo con frases como "dame el reporte de criterios" o "muestra la tabla de cumplimiento".`;

      const chatResponse = await this.aiChatClient.getChatResponse(
        systemPrompt,
        command.question,
        analysisFiles,
      );

      const processedResponse = new PassThrough();
      chatResponse.pipe(this.readData(command.messageId)).pipe(this.filterNotUserMessages()).pipe(processedResponse);

      return {
        result: processedResponse,
        fileKeys: [analysisKey],
        isDocumentGenerated: false,
        documentType: 'SUBORDINATED_DEBT'
      };
    } catch (err) {
      this.logger.error(err, "Failed to handle subordinated debt chat");
      throw err;
    }
  }

  private escapeMarkdown(text: string): string {
    // Escape pipe characters for markdown tables
    return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }

  async handle(command: PromptRegulatoryComplianceCommand): Promise<PromptRegComplCommandHandlerOutput> {
    switch (command.application) {
      case "LETTER":
        return this.handleLetter(command);
      case "WARRANTY":
        return this.handleWarranty(command);
      case "SUBORDINATED_DEBT":
        return this.handleSubordinatedDebt(command);
      case "DOCUMENT_LOAD":
      default:
        return this.handleDocumentLoad(command);
    }
  }

  private boldClauseNumber(text: string | undefined): string {
    if (!text) return '';
    // Busca "Cláusula X.Y.Z:" (múltiples niveles) y "Art° X-Y-Zc:" (con letra opcional) y los envuelve en negrita
    // Incluye Art°, Art░, ArtÂ para manejar diferentes codificaciones Unicode
    return text.replace(/(Cláusula\s+\d+(?:\.\d+)+:|Art[°░Â]\s*\d+(?:-\d+[a-z]?)*:)/g, '**$1**');
  }
}
