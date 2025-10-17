import { v4 as uuidv4 } from "uuid";
import { Logger } from "pino";
import { CsvProcessor } from "../ports/csv-processor.interface";
import { CsvRecordData } from "../model/csv-record-data";
import { parseCsvContent, convertToNumber, extractPeriodFromDate } from "../../utils/csv-utils";
import { CsvProcessorError } from "../errors/csv-processor.error";

export class LetterInternalTablesProcessor implements CsvProcessor {
  constructor(private readonly logger: Logger) {}

  async process(recordData: CsvRecordData): Promise<Record<string, any>[]> {
    try {
      const csvContent = Buffer.from(recordData.fileContent).toString("utf-8");
      const rows = parseCsvContent(csvContent, ";");

      const { year, month } = extractPeriodFromDate(recordData.period);

      const processedRecords: Record<string, any>[] = [];

      for (const row of rows) {
        const saldoMesAnteriorValue = convertToNumber(
          row["saldo_mes_anterior"] || row["Saldo_mes_anterior"] || row["SALDO_MES_ANTERIOR"],
        );

        const record: Record<string, any> = {
          id: uuidv4(),
          codigo_credito: this.getString(row, "codigo_credito") || this.getString(row, "Codigo_credito") || this.getString(row, "CODIGO_CREDITO"),
          codigo_cliente: this.getString(row, "codigo_cliente") || this.getString(row, "Codigo_cliente") || this.getString(row, "CODIGO_CLIENTE"),
          saldo: convertToNumber(row["saldo"] || row["Saldo"] || row["SALDO"]),
          saldo_mes_anterior: saldoMesAnteriorValue === 0 ? null : saldoMesAnteriorValue,
          currency: "PEN",
          period_year: year,
          period_month: month,
        };

        processedRecords.push(record);
      }

      this.logger.info({ total: processedRecords.length }, "Processed LETTER INTERNAL records");

      return processedRecords;
    } catch (error) {
      this.logger.error({ error, key: recordData.key }, "Error processing LETTER INTERNAL CSV");
      throw new CsvProcessorError("Failed to process LETTER INTERNAL CSV", error);
    }
  }

  private getString(row: Record<string, string>, key: string): string | null {
    const value = row[key];
    return value && value.trim() !== "" ? value.trim() : null;
  }
}
