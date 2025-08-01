export function markdownTableToCsv(markdownTable: string): string {
  const lines = markdownTable.trim().split('\n');
  const csvRows: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.includes('---')) {
      continue;
    }

    if (!line || !line.includes('|')) {
      continue;
    }

    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell !== '');

    const escapedCells = cells.map((cell) => {
      let cleanCell = cell.replace(/\*\*(.*?)\*\*/g, '$1')
      cleanCell = cleanCell.replace(/\*(.*?)\*/g, '$1'); 
      cleanCell = cleanCell.replace(/`(.*?)`/g, '$1'); 

      if (cleanCell.includes(',') || cleanCell.includes('"') || cleanCell.includes('\n')) {
        cleanCell = `"${cleanCell.replace(/"/g, '""')}"`;
      }

      return cleanCell;
    });

    csvRows.push(escapedCells.join(','));
  }

  return csvRows.join('\n');
}
