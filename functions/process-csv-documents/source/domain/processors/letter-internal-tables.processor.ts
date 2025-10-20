import { v4 as uuidv4 } from "uuid";
import { Logger } from "pino";
import { CsvProcessor } from "../ports/csv-processor.interface";
import { CsvRecordData } from "../model/csv-record-data";
import { LetterInternalTable } from "../model/letter-internal-table.model";
import { extractPeriodFromDate } from "../../utils/csv-utils";
import { parseFileContent } from "../../utils/file-parser.utils";
import { CsvProcessorError } from "../errors/csv-processor.error";
import {
  validateRequiredString,
  validateRequiredNumber,
  validateOptionalNumber,
  validateCurrency,
  validatePeriodMonth,
  validatePeriodYear,
  LetterValidationError,
} from "../../utils/letter-validation.utils";

export class LetterInternalTablesProcessor implements CsvProcessor {
  constructor(private readonly logger: Logger) {}

  async process(recordData: CsvRecordData): Promise<Record<string, any>[]> {
    try {
      const rows = parseFileContent(recordData.fileContent, recordData.key);

      const { year, month } = extractPeriodFromDate(recordData.period);

      const validatedYear = validatePeriodYear(year);
      const validatedMonth = validatePeriodMonth(month);

      const processedRecords: LetterInternalTable[] = [];
      const validationErrors: Array<{ rowIndex: number; error: LetterValidationError }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowIndex = i + 1;

        try {
          const codigoCreditoRaw = this.getString(row, "codigo_credito");
          const codigoClienteRaw = this.getString(row, "codigo_cliente");
          const saldoRaw = row["saldo"];
          const saldoMesAnteriorRaw = row["saldo_mes_anterior"];

          const codigoCredito = validateRequiredString(codigoCreditoRaw, "codigo_credito", rowIndex);
          const codigoCliente = validateRequiredString(codigoClienteRaw, "codigo_cliente", rowIndex);
          const saldo = validateRequiredNumber(saldoRaw, "saldo", rowIndex);

          const saldoMesAnterior = validateOptionalNumber(saldoMesAnteriorRaw);

          const record: LetterInternalTable = {
            id: uuidv4(),
            recordId: recordData.recordId,
            codigo_credito: codigoCredito,
            codigo_cliente: codigoCliente,
            saldo,
            saldo_mes_anterior: saldoMesAnterior,
            currency: validateCurrency(),
            period_year: validatedYear,
            period_month: validatedMonth,
          };

          processedRecords.push(record);
        } catch (error) {
          if (error instanceof LetterValidationError) {
            validationErrors.push({ rowIndex, error });
            this.logger.warn(
              {
                rowIndex,
                field: error.field,
                value: error.value,
                message: error.message,
                key: recordData.key,
              },
              "Validation error for LETTER INTERNAL row"
            );
          } else {
            throw error;
          }
        }
      }

      if (validationErrors.length > 0) {
        this.logger.warn(
          {
            totalRows: rows.length,
            validRows: processedRecords.length,
            invalidRows: validationErrors.length,
            key: recordData.key,
          },
          "LETTER INTERNAL processing completed with validation errors"
        );
      }

      this.logger.info(
        {
          total: rows.length,
          processed: processedRecords.length,
          skipped: validationErrors.length,
        },
        "Processed LETTER INTERNAL records"
      );

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
