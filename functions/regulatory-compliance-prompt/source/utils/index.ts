export function markdownToCSV(markdownTable: string): string {
  const lines = markdownTable.trim().split("\n");

  const dataRows = lines.filter(line => !/^(\|[-\s]*)+$/.test(line));

  const parsedRows = dataRows.map(line =>
    line
      .split("|")
      .slice(1, -1)
      .map(cell => `"${cell.trim()}"`)
      .join(",")
  );

  return parsedRows.join("\n");
}
