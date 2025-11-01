export const normalizeColumnName = (columnName: string): string => {
  return columnName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
};

export const normalizeRowKeys = (row: Record<string, any>): Record<string, any> => {
  const normalizedRow: Record<string, any> = {};

  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeColumnName(key);
    normalizedRow[normalizedKey] = value;
  }

  return normalizedRow;
};
