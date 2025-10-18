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
import { CsvProcessorError } from "../errors/csv-processor.error";

const CONSTANTS = {
  CC_FILTER: "8414020102",
  IDENSUP: "97019df3-513a-4256-8301-84e74671db1b",
};

export class WarrantyRegulatoryReportsProcessor implements CsvProcessor {
  constructor(private readonly logger: Logger) {}

  async process(recordData: CsvRecordData): Promise<Record<string, any>[]> {
    try {
      const csvContent = Buffer.from(recordData.fileContent).toString("utf-8");
      const rows = parseCsvContent(csvContent, ";");

      const { year, month } = extractPeriodFromDate(recordData.period);

      const processedRecords: Record<string, any>[] = [];

      for (const row of rows) {
        const cc = row["CC"] || row["cc"];
        if (cc !== CONSTANTS.CC_FILTER) {
          continue;
        }

        const mongr = convertToInteger(row["MONGR"] || row["mongr"], 0);

        const vcom = convertToNumber(row["VCOM"] || row["vcom"]);
        const vrea = convertToNumber(row["VREA"] || row["vrea"]);

        const record: Record<string, any> = {
          ID: uuidv4(),
          recordId: recordData.recordId,
          CODGR: this.getString(row, "CODGR"),
          CGR: convertToInteger(row["CGR"] || row["cgr"]),
          TGR: this.getString(row, "TGR"),
          CC: this.getString(row, "CC"),
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
          CODINSCRIPCION: this.getString(row, "CODINSCRIPCION"),
          NINS: this.getString(row, "NINS") || "P19041954",
          IDENSUP: CONSTANTS.IDENSUP,
          PERIOD_YEAR: year,
          PERIOD_MONTH: month,
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
        { total: rows.length, filtered: processedRecords.length },
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
