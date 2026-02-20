import csv from "csv-parser";

import { Logger } from "pino";
import { HighlightPdfCommand } from "../commands/highlight-pdf.command";
import { PdfNotFoundError, PdfProcessingError } from "../errors/highlight-pdf.error";
import { FileStorageClient } from "../ports/file-storage.client";
import { PdfProcessor } from "../ports/pdf-processor";
import { Readable } from "stream";

type CommandHandlerExecuteOutput = {
  downloadName: string;
  buffer: Buffer;
};

export class HighlightPdfCommandHandler {
  constructor(
    private readonly csvAnalysisFileStorageClient: FileStorageClient,
    private readonly recordsFileStorageClient: FileStorageClient,
    private readonly pdfProcessor: PdfProcessor,
    private readonly logger: Logger,
  ) {}

  private processCsv(value: Buffer) {
    return new Promise<Array<Record<string, string>>>((resolve, reject) => {
      const values: Array<Record<string, string>> = [];
      Readable.from(value)
        .pipe(csv())
        .on("data", (data) => {
          values.push(data);
        })
        .on("error", (error) => {
          reject(error);
        })
        .on("end", () => {
          resolve(values);
        });
    });
  }

  async execute(command: HighlightPdfCommand): Promise<CommandHandlerExecuteOutput> {
    const { messageId, recordKey, index } = command;
    this.logger.debug({ messageId, recordKey }, "Starting PDF highlight process");

    let messagePdfHighlightsBuffer: Buffer;
    try {
      messagePdfHighlightsBuffer = await this.csvAnalysisFileStorageClient.getObjectByKey(
        `pdf-highlights/csv-result-${messageId}.csv`,
      );
    } catch (error) {
      this.logger.error({ error, key: recordKey }, "Error fetching highlights from S3");
      throw new PdfNotFoundError(`PDF highlights file not found for ${messageId}`);
    }

    let pdfHighlights: Array<Record<string, string>>;
    try {
      pdfHighlights = await this.processCsv(messagePdfHighlightsBuffer);
      this.logger.debug({ pdfHighlights }, "PDF highlights");
    } catch (error) {
      this.logger.error({ error, key: recordKey }, "Error parsing CSV to XLSX");
      throw new PdfProcessingError("Error parsing CSV to XLSX");
    }

    let pdfBuffer: Buffer;
    const pdfHighlight = pdfHighlights[index];

    // Use the recordKey from the URL path param (exact S3 key from the frontend/DynamoDB),
    // not pdfHighlight.recordKey from the CSV. The LLM strips the file extension and
    // sanitizes the document name before writing it to the CSV, making it unreliable.
    try {
      pdfBuffer = await this.recordsFileStorageClient.getObjectByKey(recordKey);
      this.logger.debug({ pdfHighlight, recordKey }, "PDF downloaded, processing highlights");
    } catch (error) {
      this.logger.error({ error, key: recordKey }, "Error fetching record from S3");
      throw new PdfNotFoundError(`Record not found for key ${recordKey}`);
    }

    let highlightedPdfBuffer: Buffer;
    try {
      highlightedPdfBuffer = await this.pdfProcessor.highlightParagraph(
        pdfBuffer,
        pdfHighlight.paragraph,
        Number.parseInt(pdfHighlight.pageNumber),
      );
    } catch (error) {
      this.logger.error({ error }, "Error processing PDF highlights");
      if (error instanceof Error) {
        throw new PdfProcessingError(`Failed to highlight PDF: ${error.message}`);
      }
      throw new PdfProcessingError("Failed to highlight PDF");
    }

    this.logger.debug("PDF highlighted successfully");

    // Use command.recordKey (the exact S3 key) for the download filename
    const originalFileName = recordKey.split("/").pop() || "document.pdf";
    const downloadName = originalFileName.replace(".pdf", "_highlighted.pdf");

    this.logger.debug({ downloadName }, "PDF highlight process completed successfully");

    return {
      downloadName,
      buffer: highlightedPdfBuffer,
    };
  }
}
