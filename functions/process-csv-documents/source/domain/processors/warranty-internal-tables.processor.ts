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

export class WarrantyInternalTablesProcessor implements CsvProcessor {
  constructor(private readonly logger: Logger) { }

  async process(recordData: CsvRecordData): Promise<Record<string, any>[]> {
    try {
      const csvContent = Buffer.from(recordData.fileContent).toString("utf-8");
      const rows = parseCsvContent(csvContent, ";");

      const { year: periodYear, month: periodMonth } = extractPeriodFromDate(recordData.period);

      const processedRecords: Record<string, any>[] = [];

      for (const row of rows) {
        const codigoCliente = this.getString(row, "Codigo_Cliente") || this.getString(row, "codigo_cliente");
        const codigoGarantia = this.getString(row, "Codigo_Garantia") || this.getString(row, "codigo_garantia");

        const codgr = `${codigoCliente}${String(codigoGarantia).padStart(3, "0")}`;

        const record: Record<string, any> = {
          id: uuidv4(),
          recordId: recordData.recordId,
          codigo_cliente: codigoCliente,
          codigo_garantia: codigoGarantia,
          codigo_tipo_garantia: this.getString(row, "Codigo_Tipo_Garantia") || this.getString(row, "codigo_tipo_garantia"),
          descripcion_garantia: this.getString(row, "Descripcion_Garantia") || this.getString(row, "descripcion_garantia"),
          direccion_garantia: this.getString(row, "Direccion_Garantia") || this.getString(row, "direccion_garantia"),
          codigo_moneda: convertToInteger(row["Codigo_Moneda"] || row["codigo_moneda"]),
          tipo_cambio_tasacion: convertToNumber(row["Tipo_Cambio_Tasacion"] || row["tipo_cambio_tasacion"]),
          fecha_tasacion: validateAndConvertDate(row["Fecha_tasacion"] || row["fecha_tasacion"]),
          fecha_vencimiento_tasacion:
            validateAndConvertDate(row["Fecha_vencimiento_tasacion"] || row["fecha_vencimiento_tasacion"]),
          valor_mercado: convertToNumber(row["Valor_Mercado"] || row["valor_mercado"]),
          valor_realizacion: convertToNumber(row["Valor_Realizacion"] || row["valor_realizacion"]),
          valor_mercado_soles: convertToNumber(row["Valor_Mercado_Soles"] || row["valor_mercado_soles"]),
          valor_realizacion_soles: convertToNumber(row["Valor_Realizacion_Soles"] || row["valor_realizacion_soles"]),
          valor_constitucion: convertToNumber(row["Valor_Constitucion"] || row["valor_constitucion"]),
          valor_constitucion_soles: convertToNumber(row["Valor_Constitucion_Soles"] || row["valor_constitucion_soles"]),
          numero_poliza: this.getString(row, "Numero_Poliza") || this.getString(row, "numero_poliza"),
          fecha_inicio_poliza: validateAndConvertDate(row["Fecha_inicio_poliza"] || row["fecha_inicio_poliza"]),
          fecha_fin_poliza: validateAndConvertDate(row["Fecha_fin_poliza"] || row["fecha_fin_poliza"]),
          fecha_constitucion: validateAndConvertDate(row["Fecha_Constitucion"] || row["fecha_constitucion"]),
          codigo_inscripcion: this.getString(row, "Codigo_Inscripcion") || this.getString(row, "codigo_inscripcion"),
          nombre_tasador: cleanNombreField(this.getString(row, "Nombre_Tasador") || this.getString(row, "nombre_tasador") || ""),
          codgr,
          period_year: periodYear,
          period_month: periodMonth,
          period: `${periodYear}-${String(periodMonth).padStart(2, "0")}`,
          supervisedEntityId: cleanSupervisedEntityId(recordData.supervisedEntityId),
        };

        processedRecords.push(record);
      }

      this.logger.info({ total: processedRecords.length }, "Processed WARRANTY INTERNAL records");

      return processedRecords;
    } catch (error) {
      this.logger.error({ error, key: recordData.key }, "Error processing WARRANTY INTERNAL CSV");
      throw new CsvProcessorError("Failed to process WARRANTY INTERNAL CSV", error);
    }
  }

  private getString(row: Record<string, string>, key: string): string | null {
    const value = row[key] || row[key.toLowerCase()];
    return value && value.trim() !== "" ? value.trim() : null;
  }
}
