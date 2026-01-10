import { Logger } from "pino";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
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

  async executeSubordinatedDebtAnalysis(recordId: string): Promise<CommandHandlerExecuteOutput> {
    const analysisKey = `analysis/${recordId}.json`;
    const downloadName = `Reporte_Criterios_Deuda_Subordinada_${recordId}.xlsx`;

    this.logger.info({ analysisKey }, "Getting subordinated debt analysis from S3");

    let jsonBuffer: Buffer<ArrayBufferLike>;
    try {
      jsonBuffer = await this.fileStorageClient.getObjectByKey(analysisKey);
    } catch (error) {
      this.logger.error({ error, analysisKey }, "Error getting subordinated debt analysis from S3");
      if (error instanceof NotFoundError) {
        throw new FileNotFoundError("Subordinated debt analysis not found");
      }
      throw new GetAnalysisSheetError("Error getting subordinated debt analysis from S3");
    }

    let analysisData: any;
    try {
      analysisData = JSON.parse(jsonBuffer.toString('utf-8'));
    } catch (error) {
      this.logger.error({ error }, "Error parsing analysis JSON");
      throw new GetAnalysisSheetError("Error parsing analysis JSON");
    }

    const criterios = analysisData.criterios;
    if (!criterios || !Array.isArray(criterios)) {
      throw new GetAnalysisSheetError("Invalid analysis data structure");
    }

    // Ordenar criterios por ID (1, 2, 2a, 2b, 3, 3a, 3b, etc.)
    criterios.sort((a, b) => {
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

    this.logger.info({ criteriaCount: criterios.length }, "Generating Excel for subordinated debt analysis");

    // Create Excel with ExcelJS
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Local');

    // Merge cells for title (A1:E1 - exactly 5 columns)
    worksheet.mergeCells('A1:E1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'Criterios para autorizar deuda subordinada – Contrato';
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9D9D9' },
    };
    worksheet.getRow(1).height = 25;

    // Define columns (starting from row 2)
    worksheet.getRow(2).values = ['N°', 'Basilea III', 'Resolución SBS N° 3950-2022', 'Contrato', 'Cumplimiento'];
    
    worksheet.columns = [
      { key: 'id', width: 8 },
      { key: 'basilea', width: 50 },
      { key: 'resolucion_sbs', width: 50 },
      { key: 'contrato', width: 50 },
      { key: 'cumplimiento', width: 60 },
    ];

    // Style header row (row 2) - Apply ONLY to columns A-E
    const headerRow = worksheet.getRow(2);
    ['A', 'B', 'C', 'D', 'E'].forEach(col => {
      const cell = headerRow.getCell(col);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F81BD' },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    headerRow.height = 30;

    // Helper function to apply bold to "Cláusula X.XX:" in Excel rich text
    const applyClauseBold = (text: string) => {
      const regex = /(Cláusula\s+\d+\.\d+:)/g;
      const parts: Array<{ text: string; font?: { bold: boolean } }> = [];
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(text)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          parts.push({ text: text.substring(lastIndex, match.index) });
        }
        // Add bold clause
        parts.push({ text: match[0], font: { bold: true } });
        lastIndex = regex.lastIndex;
      }

      // Add remaining text
      if (lastIndex < text.length) {
        parts.push({ text: text.substring(lastIndex) });
      }

      return parts.length > 0 ? { richText: parts } : text;
    };

    // Add data rows
    criterios.forEach((criterio: any) => {
      const cumplimientoText = criterio.cumplimiento === "Cumple" 
        ? "Cumple" 
        : `${criterio.cumplimiento}: ${criterio.justificacion}`;

      const row = worksheet.addRow({
        id: criterio.id,
        basilea: criterio.basilea,
        resolucion_sbs: criterio.resolucion_sbs,
        contrato: criterio.contrato,
        cumplimiento: cumplimientoText,
      });

      // Apply bold formatting to clauses
      const basileaCell = row.getCell('basilea');
      basileaCell.value = applyClauseBold(criterio.basilea);

      const resolucionCell = row.getCell('resolucion_sbs');
      resolucionCell.value = applyClauseBold(criterio.resolucion_sbs);

      const contratoCell = row.getCell('contrato');
      contratoCell.value = applyClauseBold(criterio.contrato);
    });

    // Style data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 2) { // Skip title and header
        row.alignment = { vertical: 'top', wrapText: true };
        row.height = 60;
        
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });

        // Color cumplimiento cell based on status (only green or red)
        const cumplimientoCell = row.getCell('cumplimiento');
        const criterioIndex = rowNumber - 3; // Adjust for title row (1) and header row (2)
        const cumpleValue = criterios[criterioIndex]?.cumplimiento; // Use 'cumplimiento' not 'cumple'
        
        if (cumpleValue === 'Cumple') {
          cumplimientoCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' }, // Light green
          };
        } else if (cumpleValue === 'No cumple') {
          cumplimientoCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC7CE' }, // Light red
          };
        }
      }
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    return {
      downloadName,
      buffer: Buffer.from(buffer),
    };
  }
}
