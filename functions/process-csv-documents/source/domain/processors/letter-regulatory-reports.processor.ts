import { v4 as uuidv4 } from "uuid";
import { Logger } from "pino";
import { CsvProcessor } from "../ports/csv-processor.interface";
import { CsvRecordData } from "../model/csv-record-data";
import { parseCsvContent, convertToNumber, convertToInteger, extractPeriodFromDate } from "../../utils/csv-utils";
import { CsvProcessorError } from "../errors/csv-processor.error";

export class LetterRegulatoryReportsProcessor implements CsvProcessor {
  constructor(private readonly logger: Logger) {}

  async process(recordData: CsvRecordData): Promise<Record<string, any>[]> {
    try {
      const csvContent = Buffer.from(recordData.fileContent).toString("utf-8");
      const rows = parseCsvContent(csvContent, ";");

      const { year, month } = extractPeriodFromDate(recordData.period);

      const processedRecords: Record<string, any>[] = [];

      for (const row of rows) {
        const nclValue = this.getString(row, "ncl") || this.getString(row, "NCL") || "";
        const nclCleaned = nclValue.replace(/^"|"$/g, "").trim();

        const kcoMesAnteriorValue = convertToNumber(row["kco_mes_anterior"] || row["KCO_MES_ANTERIOR"]);
        const cccoMesAnteriorValue = this.getString(row, "ccco_mes_anterior") || this.getString(row, "CCCO_MES_ANTERIOR");

        const record: Record<string, any> = {
          id: uuidv4(),
          recordId: recordData.recordId,
          ccr: this.getString(row, "ccr") || this.getString(row, "CCR"),
          ccl: this.getString(row, "ccl") || this.getString(row, "CCL"),
          csbs: this.getString(row, "csbs") || this.getString(row, "CSBS"),
          ncl: nclCleaned || null,
          kco: convertToNumber(row["kco"] || row["KCO"]),
          ccco: this.getString(row, "ccco") || this.getString(row, "CCCO"),
          kco_mes_anterior: kcoMesAnteriorValue === 0 ? null : kcoMesAnteriorValue,
          ccco_mes_anterior: cccoMesAnteriorValue === "0" ? null : cccoMesAnteriorValue,
          convenio_fmv: this.getString(row, "convenio_fmv") || this.getString(row, "CONVENIO_FMV"),
          currency: "PEN",
          period_year: year,
          period_month: month,
        };

        processedRecords.push(record);
      }

      processedRecords.sort((a, b) => {
        const aHasConvenio = a.convenio_fmv !== null && a.convenio_fmv !== undefined;
        const bHasConvenio = b.convenio_fmv !== null && b.convenio_fmv !== undefined;

        if (aHasConvenio && !bHasConvenio) return -1;
        if (!aHasConvenio && bHasConvenio) return 1;

        if (aHasConvenio && bHasConvenio) {
          return (a.convenio_fmv || "").localeCompare(b.convenio_fmv || "");
        }

        return 0;
      });

      this.logger.info({ total: processedRecords.length }, "Processed LETTER REGULATORY records");

      return processedRecords;
    } catch (error) {
      this.logger.error({ error, key: recordData.key }, "Error processing LETTER REGULATORY CSV");
      throw new CsvProcessorError("Failed to process LETTER REGULATORY CSV", error);
    }
  }

  private getString(row: Record<string, string>, key: string): string | null {
    const value = row[key];
    return value && value.trim() !== "" ? value.trim() : null;
  }
}
