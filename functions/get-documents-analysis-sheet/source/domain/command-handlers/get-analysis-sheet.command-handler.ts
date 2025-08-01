import { Logger } from "pino";
import * as XLSX from "xlsx";
import { GetAnalysisSheetCommand } from "../commands/get-analysis-sheet.command";
import { ExtractCsvTextError, FileNotFoundError, GetAnalysisSheetError } from "../errors/get-analysis-sheet.error";
import { FileStorageClient } from "../ports/file-storage.client";
import { NotFoundError } from "../errors/file-storage.error";

type CommandHandlerExecuteOutput = {
  downloadName: string;
  buffer: Buffer;
};

export class GetAnalysisSheetCommandHandler {
  constructor(private readonly fileStorageClient: FileStorageClient, private readonly logger: Logger) {}

  private sanitizeCell(v: unknown) {
    if (typeof v !== "string") return v;
    return /^[=\-+@]/.test(v) ? "'" + v : v;
  }

  /** Iterate all cells in a sheet and sanitize string values */
  private sanitizeWorksheet(ws: XLSX.WorkSheet) {
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (!cell) continue;
        if (typeof cell.v === "string") {
          cell.v = this.sanitizeCell(cell.v);
          // keep the cell type as text
          cell.t = "s";
          this.logger.debug({ cell }, "Cell");
        }
      }
    }
  }

  async execute(command: GetAnalysisSheetCommand): Promise<CommandHandlerExecuteOutput> {
    const { key } = command;
    const downloadName = key.replace(/^.*\//, "").replace(/\.csv$/i, "") + ".xlsx";

    let csvBuffer: Buffer<ArrayBufferLike> | undefined = undefined;
    try {
      this.logger.debug({ key }, "Getting object from S3");
      csvBuffer = await this.fileStorageClient.getObjectByKey(key);
    } catch (error) {
      this.logger.error({ error, key }, "Error getting object from S3");
      if (error instanceof NotFoundError) {
        throw new FileNotFoundError("File not found");
      }
      throw new GetAnalysisSheetError("Error getting object from S3");
    }

    let workBook: XLSX.WorkBook | undefined = undefined;
    try {
      workBook = XLSX.read(csvBuffer, { type: "buffer", codepage: 65001 });
    } catch (error) {
      this.logger.error({ error, key }, "Error parsing CSV to XLSX");
      throw new ExtractCsvTextError("Error parsing CSV to XLSX");
    }

    const sheetName = workBook.SheetNames[0] ?? "Sheet 1";
    const workSheet = workBook.Sheets[sheetName];
    this.sanitizeWorksheet(workSheet);

    let xlsxBuffer: Buffer<ArrayBufferLike> | undefined = undefined;
    try {
      xlsxBuffer = XLSX.write(workBook, {
        bookType: "xlsx",
        type: "buffer",
        compression: true,
      }) as Buffer<ArrayBufferLike>;
    } catch (error) {
      this.logger.error({ error, key }, "Error writing XLSX");
      throw new GetAnalysisSheetError("Error writing XLSX");
    }

    return {
      downloadName,
      buffer: xlsxBuffer,
    };
  }
}
