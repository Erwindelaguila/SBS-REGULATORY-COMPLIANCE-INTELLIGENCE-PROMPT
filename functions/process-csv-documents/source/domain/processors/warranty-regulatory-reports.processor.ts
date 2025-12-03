import { v4 as uuidv4 } from "uuid";
import { Logger } from "pino";
import { CsvProcessor } from "../ports/csv-processor.interface";
import { CsvRecordData } from "../model/csv-record-data";
import {
  parseCsvContent,
  validateAndConvertDate,
  cleanNombreField,
  convertToNumber,
  convertToInteger,
  extractPeriodFromDate,
} from "../../utils/csv-utils";
import { cleanSupervisedEntityId } from "../../utils/letter-validation.utils";
import { CsvProcessorError } from "../errors/csv-processor.error";

const CONSTANTS = {
  CC_FILTERS: ["8414020102", "8404020000000000", "8404020102010000"], 
};

export class WarrantyRegulatoryReportsProcessor implements CsvProcessor {
  constructor(private readonly logger: Logger) { }

  /**
   * Normaliza el código CC que puede venir en notación científica desde Excel
   * Ejemplo: "8.40402E+15" -> "8404020000000000"
   */
  private normalizeCC(cc: string | null): string | null {
    if (!cc) return null;
    
    const ccStr = cc.trim();
    
    // Si contiene notación científica (E o e), convertir a número y luego a string
    if (ccStr.includes('E') || ccStr.includes('e')) {
      try {
        const numericValue = parseFloat(ccStr);
        if (!isNaN(numericValue)) {
          // Convertir a entero (sin decimales) y luego a string
          return Math.floor(numericValue).toString();
        }
      } catch {
        return ccStr; // Si falla, devolver original
      }
    }
    
    return ccStr;
  }

  async process(recordData: CsvRecordData): Promise<Record<string, any>[]> {
    try {
      const csvContent = Buffer.from(recordData.fileContent).toString("latin1");
      const rows = parseCsvContent(csvContent, ";");

      const { year, month } = extractPeriodFromDate(recordData.period);

      const processedRecords: Record<string, any>[] = [];

      for (const row of rows) {
        const ccRaw = row["CC"] || row["cc"];
        const cc = this.normalizeCC(ccRaw);
        
        // Filtrar: solo procesar registros con CC válido 
        if (!cc || !CONSTANTS.CC_FILTERS.includes(cc)) {
          continue;
        }

        const mongr = convertToInteger(row["MONGR"] || row["mongr"], 0);

        const vcom = convertToNumber(row["VCOM"] || row["vcom"]);
        const vrea = convertToNumber(row["VREA"] || row["vrea"]);

        const codgr = this.getString(row, "CODGR");
        const codinscripcion = this.getString(row, "CODINSCRIPCION");

        const record: Record<string, any> = {
          ID: uuidv4(),
          recordId: recordData.recordId,
          ...(codgr !== null && { CODGR: codgr }),
          CGR: convertToInteger(row["CGR"] || row["cgr"]),
          TGR: this.getString(row, "TGR"),
          CC: cc, // Usar el CC normalizado
          REPEV: cleanNombreField(this.getString(row, "REPEV") || ""),
          POL: this.getString(row, "POL"),
          VCONS: convertToNumber(row["VCONS"] || row["vcons"]),
          FCONS: validateAndConvertDate(row["FCONS"] || row["fcons"]),
          FUVAL: validateAndConvertDate(row["FUVAL"] || row["fuval"]),
          VCOM: vcom,
          VREA: vrea,
          MONGR: mongr,
          BLOQ: convertToInteger(row["BLOQ"] || row["bloq"]),
          VBC: convertToNumber(row["VBC"] || row["vbc"]),
          COBGR: convertToInteger(row["COBGR"] || row["cobgr"]),
          CCLQGR: this.getString(row, "CCLQGR"),
          NCLQGR: this.getString(row, "NCLQGR"),
          VANX: convertToNumber(row["VANX"] || row["vanx"]),
          IGRC: convertToInteger(row["IGRC"] || row["igrc"]),
          FVEPOL: validateAndConvertDate(row["FVEPOL"] || row["fvepol"]),
          FBLOQ: validateAndConvertDate(row["FBLOQ"] || row["fbloq"]),
          FINPOL: null,
          IDREPEV: this.getString(row, "IDREPEV"),
          ...(codinscripcion !== null && { CODINSCRIPCION: codinscripcion }),
          supervisedEntityId: cleanSupervisedEntityId(recordData.supervisedEntityId),
          PERIOD_YEAR: year,
          PERIOD_MONTH: month,
          period: `${year}-${String(month).padStart(2, "0")}`,
        };

        if (mongr === 1) {
          record.VCOM_PEN = vcom;
          record.VREA_PEN = vrea;
          record.VCOM_USD = null;
          record.VREA_USD = null;
          record.VCOM_OTH = null;
          record.VREA_OTH = null;
        } else if (mongr === 2) {
          record.VCOM_PEN = null;
          record.VREA_PEN = null;
          record.VCOM_USD = vcom;
          record.VREA_USD = vrea;
          record.VCOM_OTH = null;
          record.VREA_OTH = null;
        } else if (mongr === 3) {
          record.VCOM_PEN = null;
          record.VREA_PEN = null;
          record.VCOM_USD = null;
          record.VREA_USD = null;
          record.VCOM_OTH = vcom;
          record.VREA_OTH = vrea;
        } else {
          record.VCOM_PEN = null;
          record.VREA_PEN = null;
          record.VCOM_USD = null;
          record.VREA_USD = null;
          record.VCOM_OTH = null;
          record.VREA_OTH = null;
        }

        processedRecords.push(record);
      }

      this.logger.info(
        { total: rows.length, processed: processedRecords.length },
        "Processed WARRANTY REGULATORY records",
      );

      return processedRecords;
    } catch (error) {
      this.logger.error({ error, key: recordData.key }, "Error processing WARRANTY REGULATORY CSV");
      throw new CsvProcessorError("Failed to process WARRANTY REGULATORY CSV", error);
    }
  }

  private getString(row: Record<string, string>, key: string): string | null {
    const value = row[key] || row[key.toLowerCase()];
    return value && value.trim() !== "" ? value.trim() : null;
  }
}
