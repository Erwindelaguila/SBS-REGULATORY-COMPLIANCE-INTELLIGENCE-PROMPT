import { parseCsvContent } from "./csv-utils";
import { parseExcelContent } from "./excel-utils";

export const parseFileContent = (
  fileContent: Uint8Array,
  fileKey: string
): Record<string, string>[] => {
  const extension = fileKey.toLowerCase().split(".").pop();

  if (extension === "xlsx" || extension === "xls") {
    return parseExcelContent(fileContent);
  }

  if (extension === "csv") {
    const csvContent = Buffer.from(fileContent).toString("utf-8");
    return parseCsvContent(csvContent, ";");
  }

  throw new Error(`Unsupported file format: ${extension}`);
};
