import { v4 as uuidv4 } from "uuid";
import { Logger } from "pino";
import { CsvProcessor } from "../ports/csv-processor.interface";
import { CsvRecordData } from "../model/csv-record-data";
import { LetterRegulatoryReport } from "../model/letter-regulatory-report.model";
import { extractPeriodFromDate } from "../../utils/csv-utils";
import { parseFileContent } from "../../utils/file-parser.utils";
import { CsvProcessorError } from "../errors/csv-processor.error";
import {
  validateRequiredString,
  validateOptionalString,
  validateOptionalNumber,
  validateRequiredNumber,
  validateCurrency,
  validatePeriodMonth,
  validatePeriodYear,
  removeQuotes,
  LetterValidationError,
} from "../../utils/letter-validation.utils";

export class LetterRegulatoryReportsProcessor implements CsvProcessor {
  constructor(private readonly logger: Logger) { }

  async process(recordData: CsvRecordData): Promise<Record<string, any>[]> {
    try {
      const rows = parseFileContent(recordData.fileContent, recordData.key);

      const { year, month } = extractPeriodFromDate(recordData.period);

      const validatedYear = validatePeriodYear(year);
      const validatedMonth = validatePeriodMonth(month);

      const processedRecords: LetterRegulatoryReport[] = [];
      const validationErrors: Array<{ rowIndex: number; error: LetterValidationError }> = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowIndex = i + 1;

        try {
          const nclRaw = this.getString(row, "ncl") || "";
          const ccrRaw = this.getString(row, "ccr");
          const cclRaw = this.getString(row, "ccl");
          const csbsRaw = this.getString(row, "csbs");
          const kcoRaw = row["kco"];
          const cccoRaw = this.getString(row, "ccco");
          const kcoMesAnteriorRaw = row["kco_mes_anterior"];
          const cccoMesAnteriorRaw = this.getString(row, "ccco_mes_anterior");
          const convenioFmvRaw = this.getString(row, "convenio_fmv");

          const ccr = validateRequiredString(ccrRaw, "ccr", rowIndex);
          const ccl = validateRequiredString(cclRaw, "ccl", rowIndex);
          const csbs = validateRequiredString(csbsRaw, "csbs", rowIndex);
          const kco = validateRequiredNumber(kcoRaw, "kco", rowIndex);
          const ccco = validateRequiredString(cccoRaw, "ccco", rowIndex);

          const nclWithoutQuotes = removeQuotes(nclRaw);
          const ncl = validateOptionalString(nclWithoutQuotes);

          const kcoMesAnterior = validateOptionalNumber(kcoMesAnteriorRaw);
          const cccoMesAnterior = cccoMesAnteriorRaw === "0" ? null : validateOptionalString(cccoMesAnteriorRaw);

          const convenioFmv = validateOptionalString(convenioFmvRaw);

          const period = validatedYear && validatedMonth
            ? `${validatedYear}-${String(validatedMonth).padStart(2, '0')}`
            : null;

          const record: LetterRegulatoryReport = {
            id: uuidv4(),
            recordId: recordData.recordId,
            ccr,
            ccl,
            csbs,
            ncl,
            kco,
            ccco,
            kco_mes_anterior: kcoMesAnterior,
            ccco_mes_anterior: cccoMesAnterior,
            convenio_fmv: convenioFmv,
            currency: validateCurrency(),
            period_year: validatedYear,
            period_month: validatedMonth,
            period,
            supervisedEntityId: recordData.supervisedEntityId,
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
              "Validation error for LETTER REGULATORY row"
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
          "LETTER REGULATORY processing completed with validation errors"
        );
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

      this.logger.info(
        {
          total: rows.length,
          processed: processedRecords.length,
          skipped: validationErrors.length,
        },
        "Processed LETTER REGULATORY records"
      );

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
