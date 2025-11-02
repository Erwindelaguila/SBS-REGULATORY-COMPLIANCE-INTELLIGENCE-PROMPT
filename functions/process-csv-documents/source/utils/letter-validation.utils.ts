import { convertToNumber } from "./csv-utils";

export class LetterValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: any,
    public readonly rowIndex?: number
  ) {
    super(message);
    this.name = "LetterValidationError";
  }
}

export const validateRequiredString = (
  value: string | null | undefined,
  fieldName: string,
  rowIndex?: number
): string => {
  if (!value || value.trim() === "") {
    throw new LetterValidationError(
      `Required field '${fieldName}' is missing or empty`,
      fieldName,
      value,
      rowIndex
    );
  }
  return value.trim();
};

export const validateOptionalString = (value: string | null | undefined): string | null => {
  if (!value || value.trim() === "") {
    return null;
  }
  return value.trim();
};

export const removeQuotes = (value: string): string => {
  if (!value) return value;
  return value.replace(/^["']|["']$/g, "").trim();
};

export const cleanSupervisedEntityId = (value: string): string => {
  if (!value) return value;
  const hashIndex = value.indexOf("#");
  if (hashIndex === -1) return value;
  return value.substring(0, hashIndex);
};

export const validateCurrency = (): "PEN" => {
  return "PEN";
};

export const validateRequiredNumber = (
  value: any,
  fieldName: string,
  rowIndex?: number
): number => {
  const num = convertToNumber(value);

  if (num === null) {
    throw new LetterValidationError(
      `Required number field '${fieldName}' is invalid or missing`,
      fieldName,
      value,
      rowIndex
    );
  }

  return num;
};

export const validateOptionalNumber = (value: any): number | null => {
  const num = convertToNumber(value);

  if (num === null || num === 0) {
    return null;
  }

  return num;
};

export const validatePeriodMonth = (month: number): number => {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new LetterValidationError(
      `Invalid period_month: ${month}. Must be between 1 and 12`,
      "period_month",
      month
    );
  }
  return month;
};

export const validatePeriodYear = (year: number): number => {
  const currentYear = new Date().getFullYear();
  const minYear = 2000;
  const maxYear = currentYear + 10;

  if (!Number.isInteger(year) || year < minYear || year > maxYear) {
    throw new LetterValidationError(
      `Invalid period_year: ${year}. Must be between ${minYear} and ${maxYear}`,
      "period_year",
      year
    );
  }
  return year;
};
