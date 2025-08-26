import { Logger } from "pino";
import { HighlightPdfCommand } from "../commands/highlight-pdf.command";
import { 
  RecordNotFoundError, 
  PdfNotFoundError, 
  PdfProcessingError 
} from "../errors/highlight-pdf.error";
import { FileStorageClient } from "../ports/file-storage.client";
import { PdfProcessor } from "../ports/pdf-processor";
import { SupervisoryRecordsRepository } from "../ports/supervisory-records.repository";

type CommandHandlerExecuteOutput = {
  downloadName: string;
  buffer: Buffer;
};

export class HighlightPdfCommandHandler {
  constructor(
    private readonly supervisoryRecordsRepository: SupervisoryRecordsRepository,
    private readonly fileStorageClient: FileStorageClient,
    private readonly pdfProcessor: PdfProcessor,
    private readonly logger: Logger
  ) {}

  async execute(command: HighlightPdfCommand): Promise<CommandHandlerExecuteOutput> {
    const { uuid, paragraph, pageNumber } = command;
    
    this.logger.debug({ uuid, pageNumber }, "Starting PDF highlight process");
    
    // 1. Obtener registro de DynamoDB para obtener la key de S3
    const record = await this.supervisoryRecordsRepository.getRecordById(uuid);
    
    if (!record) {
      this.logger.error({ uuid }, "Record not found in DynamoDB");
      throw new RecordNotFoundError(`Record with UUID ${uuid} not found`);
    }
    
    this.logger.debug({ key: record.key }, "Record found, fetching PDF from S3");
    
    // 2. Descargar PDF desde S3
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await this.fileStorageClient.getObjectByKey(record.key);
    } catch (error) {
      this.logger.error({ error, key: record.key }, "Error fetching PDF from S3");
      throw new PdfNotFoundError(`PDF file not found for key ${record.key}`);
    }
    
    this.logger.debug("PDF downloaded, processing highlights");
    
    // 3. Procesar el PDF y agregar highlights
    let highlightedPdfBuffer: Buffer;
    try {
      highlightedPdfBuffer = await this.pdfProcessor.highlightParagraph(
        pdfBuffer,
        paragraph,
        pageNumber
      );
    } catch (error) {
      this.logger.error({ error, paragraph, pageNumber }, "Error processing PDF highlights");
      if (error instanceof Error) {
        throw new PdfProcessingError(`Failed to highlight PDF: ${error.message}`);
      }
      throw new PdfProcessingError("Failed to highlight PDF");
    }
    
    // 4. Generar nombre de descarga
    const originalFileName = record.key.split('/').pop() || 'document.pdf';
    const downloadName = originalFileName.replace('.pdf', '_highlighted.pdf');
    
    this.logger.debug({ downloadName }, "PDF highlight process completed successfully");
    
    return {
      downloadName,
      buffer: highlightedPdfBuffer
    };
  }
}