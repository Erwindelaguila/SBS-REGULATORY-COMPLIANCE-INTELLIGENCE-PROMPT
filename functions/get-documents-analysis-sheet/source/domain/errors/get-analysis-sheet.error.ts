import { ErrorCodes } from "./error-codes";

export class GetAnalysisSheetError extends Error {
  public readonly code: string;

  constructor(message: string, code = ErrorCodes.ERROR_DA_GE_001) {
    super(message);
    this.name = "GetDocumentsAnalysisError";
    this.code = code;
  }
}

export class ExtractCsvTextError extends GetAnalysisSheetError {
  constructor(message: string) {
    super(message, ErrorCodes.ERROR_DA_GE_002);
    this.name = "ExtractCsvTextError";
  }
}

export class FileNotFoundError extends GetAnalysisSheetError {
  constructor(message: string) {
    super(message, ErrorCodes.ERROR_DA_GE_003);
    this.name = "FileNotFoundError";
  }
}
