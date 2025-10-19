import * as XLSX from "xlsx";

export const parseExcelContent = (content: Uint8Array): Record<string, string>[] => {
  const workbook = XLSX.read(content, { type: "array" });

  if (workbook.SheetNames.length === 0) {
    throw new Error("Excel file has no sheets");
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: null,
    raw: false,
    dateNF: "dd/mm/yyyy",
  });

  return rows.map((row) => {
    const stringRow: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      stringRow[key] = value !== null && value !== undefined ? String(value) : "";
    }
    return stringRow;
  });
};
