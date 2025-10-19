import { parse } from "csv-parse/sync";
import { format, parseISO, getYear, getMonth } from "date-fns";

export const parseCsvContent = (content: string, delimiter: string = ";"): Record<string, string>[] => {
  const cleanContent = content.replace(/^\ufeff|\ufffe|\u00ef\u00bb\u00bf/g, "");

  return parse(cleanContent, {
    columns: true,
    skip_empty_lines: true,
    delimiter,
    trim: true,
    encoding: "utf-8",
    relaxColumnCount: true,
  });
};

export const convertExcelSerialToDate = (serialDate: number): string => {
  if (serialDate <= 0 || serialDate > 73050) {
    throw new Error(`Invalid Excel serial date: ${serialDate}`);
  }

  const baseDate = serialDate > 59 ? new Date(1899, 11, 30) : new Date(1899, 11, 31);
  const date = new Date(baseDate.getTime() + serialDate * 86400000);

  return format(date, "dd/MM/yyyy");
};

export const validateAndConvertDate = (value: string | number): string | null => {
  if (!value) return null;

  const strValue = String(value).trim();

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(strValue)) {
    const [day, month, year] = strValue.split("/").map(Number);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
    }
  }

  if (/^\d+(\.\d+)?$/.test(strValue)) {
    try {
      const serialDate = parseInt(strValue, 10);
      return convertExcelSerialToDate(serialDate);
    } catch {
      return null;
    }
  }

  return null;
};

export const cleanNombreField = (nombre: string): string => {
  if (!nombre) return "";
  return nombre.replace(/\//g, " ").replace(/\\\\/g, "").replace(/\.,/g, ",").trim();
};

export const convertToNumber = (value: any, defaultValue: number | null = null): number | null => {
  if (value === null || value === undefined || value === "") return defaultValue;
  const strValue = String(value).trim().replace(/,/g, ".");
  const num = parseFloat(strValue);
  return isNaN(num) ? defaultValue : num;
};

export const convertToInteger = (value: any, defaultValue: number | null = null): number | null => {
  const num = convertToNumber(value, defaultValue);
  return num !== null ? Math.floor(num) : defaultValue;
};

export const extractPeriodFromDate = (periodIsoString: string): { year: number; month: number } => {
  const periodDate = parseISO(periodIsoString);
  return {
    year: getYear(periodDate),
    month: getMonth(periodDate) + 1,
  };
};
