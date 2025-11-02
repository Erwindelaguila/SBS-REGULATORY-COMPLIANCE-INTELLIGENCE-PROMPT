import { parse } from "csv-parse/sync";
import { format, parseISO, getYear, getMonth } from "date-fns";
import { normalizeRowKeys } from "./normalize-columns.utils";

export const validateCsvDelimiter = (content: string): void => {
  const cleanContent = content.replace(/^\ufeff|\ufffe|\u00ef\u00bb\u00bf/g, "").trim();

  if (!cleanContent) {
    throw new Error("CSV content is empty");
  }

  const lines = cleanContent.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) {
    throw new Error("CSV has no valid lines");
  }

  const firstLine = lines[0];

  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;

  if (semicolonCount === 0 && commaCount > 0) {
    throw new Error(
      `Invalid CSV delimiter. Expected semicolon (;) but found comma (,). ` +
      `This CSV appears to use comma as delimiter. Please convert to semicolon-delimited format.`
    );
  }

  if (semicolonCount === 0 && commaCount === 0) {
    throw new Error(
      `Invalid CSV format. No semicolon (;) delimiter found in header line. ` +
      `Expected semicolon-delimited CSV.`
    );
  }
};

export const parseCsvContent = (content: string, delimiter: string = ";"): Record<string, string>[] => {
  const cleanContent = content.replace(/^\ufeff|\ufffe|\u00ef\u00bb\u00bf/g, "");

  validateCsvDelimiter(cleanContent);

  const rows = parse(cleanContent, {
    columns: true,
    skip_empty_lines: true,
    delimiter,
    trim: true,
    encoding: "utf-8",
    relaxColumnCount: true,
  });

  return rows.map(normalizeRowKeys);
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

  if (/#/.test(strValue)) {
    return null;
  }

  const isoDatetimeMatch = strValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+\d{2}:\d{2}:\d{2}$/);
  if (isoDatetimeMatch) {
    const year = isoDatetimeMatch[1];
    const month = isoDatetimeMatch[2].padStart(2, "0");
    const day = isoDatetimeMatch[3].padStart(2, "0");
    return `${day}/${month}/${year}`;
  }

  const isoDateMatch = strValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoDateMatch) {
    const year = isoDateMatch[1];
    const month = isoDateMatch[2].padStart(2, "0");
    const day = isoDateMatch[3].padStart(2, "0");
    return `${day}/${month}/${year}`;
  }

  const mmDdYyMatch = strValue.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (mmDdYyMatch) {
    const month = mmDdYyMatch[1].padStart(2, "0");
    const day = mmDdYyMatch[2].padStart(2, "0");
    const yearShort = parseInt(mmDdYyMatch[3], 10);

    const fullYear = yearShort <= 30 ? 2000 + yearShort : 1900 + yearShort;

    return `${day}/${month}/${fullYear}`;
  }

  const mmDdYyyyMatch = strValue.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mmDdYyyyMatch) {
    const month = mmDdYyyyMatch[1].padStart(2, "0");
    const day = mmDdYyyyMatch[2].padStart(2, "0");
    const year = mmDdYyyyMatch[3];
    return `${day}/${month}/${year}`;
  }

  const ddMmYyyyMatch = strValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddMmYyyyMatch) {
    const day = ddMmYyyyMatch[1].padStart(2, "0");
    const month = ddMmYyyyMatch[2].padStart(2, "0");
    const year = ddMmYyyyMatch[3];

    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    const yearNum = parseInt(year, 10);

    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900 && yearNum <= 2100) {
      return `${day}/${month}/${year}`;
    }
  }

  const ddMmYyyyTimeMatch = strValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+\d{1,2}:\d{2}$/);
  if (ddMmYyyyTimeMatch) {
    const day = ddMmYyyyTimeMatch[1].padStart(2, "0");
    const month = ddMmYyyyTimeMatch[2].padStart(2, "0");
    const year = ddMmYyyyTimeMatch[3];
    return `${day}/${month}/${year}`;
  }

  const ddMmYyMatch = strValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (ddMmYyMatch) {
    const day = ddMmYyMatch[1].padStart(2, "0");
    const month = ddMmYyMatch[2].padStart(2, "0");
    const yearShort = parseInt(ddMmYyMatch[3], 10);

    const fullYear = yearShort <= 30 ? 2000 + yearShort : 1900 + yearShort;

    return `${day}/${month}/${fullYear}`;
  }

  if (/^\d+(\.\d+)?$/.test(strValue)) {
    try {
      const serialDate = parseInt(strValue, 10);
      return convertExcelSerialToDate(serialDate);
    } catch {
      return null;
    }
  }

  return strValue;
};

export const cleanNombreField = (nombre: string): string => {
  if (!nombre || nombre.trim() === "") return "";

  const trimmedNombre = nombre.trim();

  // Pattern to detect the specific format - handles ., \, and / characters
  // Converts from: "{APELLIDO1}/{APELLIDO2}.\,{NOMBRE}"
  // To: "{APELLIDO1} {APELLIDO2}, {NOMBRE}"
  const pattern = /^(.+?)\/(.+?)\.\\\,(.+)$/;
  const match = trimmedNombre.match(pattern);

  if (match) {
    const apellido1 = match[1].trim();
    const apellido2 = match[2].trim();
    const nombre = match[3].trim();

    return `${apellido1} ${apellido2}, ${nombre}`;
  }

  // If doesn't match pattern, return original value cleaned
  return trimmedNombre;
};

export const convertToNumber = (value: any, defaultValue: number | null = null): number | null => {
  if (value === null || value === undefined || value === "") return defaultValue;

  let strValue = String(value).trim();

  strValue = strValue.replace(/^(S\/|USD|\$|€|£)\s*/gi, "");
  strValue = strValue.replace(/\s+/g, "");

  const hasCommaAsDecimal = /,\d{1,2}$/.test(strValue);

  if (hasCommaAsDecimal) {
    strValue = strValue.replace(/\./g, "").replace(/,/g, ".");
  } else {
    strValue = strValue.replace(/,/g, "");
  }

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
