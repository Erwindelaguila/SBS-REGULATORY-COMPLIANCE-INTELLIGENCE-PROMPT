export const HighlightPdfErrorCodes = {
  ERROR_HP_001: "ERROR_HP_001", // Generic error
  ERROR_HP_002: "ERROR_HP_002", // Record not found in DynamoDB
  ERROR_HP_003: "ERROR_HP_003", // PDF not found in S3
  ERROR_HP_004: "ERROR_HP_004", // Invalid PDF format
  ERROR_HP_005: "ERROR_HP_005", // Page not found
  ERROR_HP_006: "ERROR_HP_006", // Paragraph not found in page
  ERROR_HP_007: "ERROR_HP_007", // PDF processing error
};

export class HighlightPdfError extends Error {
  public readonly code: string;

  constructor(message: string, code = HighlightPdfErrorCodes.ERROR_HP_001) {
    super(message);
    this.name = "HighlightPdfError";
    this.code = code;
  }
}

export class RecordNotFoundError extends HighlightPdfError {
  constructor(message: string) {
    super(message, HighlightPdfErrorCodes.ERROR_HP_002);
    this.name = "RecordNotFoundError";
  }
}

export class PdfNotFoundError extends HighlightPdfError {
  constructor(message: string) {
    super(message, HighlightPdfErrorCodes.ERROR_HP_003);
    this.name = "PdfNotFoundError";
  }
}

export class InvalidPdfError extends HighlightPdfError {
  constructor(message: string) {
    super(message, HighlightPdfErrorCodes.ERROR_HP_004);
    this.name = "InvalidPdfError";
  }
}

export class PageNotFoundError extends HighlightPdfError {
  constructor(message: string) {
    super(message, HighlightPdfErrorCodes.ERROR_HP_005);
    this.name = "PageNotFoundError";
  }
}

export class ParagraphNotFoundError extends HighlightPdfError {
  constructor(message: string) {
    super(message, HighlightPdfErrorCodes.ERROR_HP_006);
    this.name = "ParagraphNotFoundError";
  }
}

export class PdfProcessingError extends HighlightPdfError {
  constructor(message: string) {
    super(message, HighlightPdfErrorCodes.ERROR_HP_007);
    this.name = "PdfProcessingError";
  }
}