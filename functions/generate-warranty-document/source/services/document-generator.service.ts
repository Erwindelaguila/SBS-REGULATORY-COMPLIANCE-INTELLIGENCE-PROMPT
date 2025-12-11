import { 
  Document, 
  Paragraph, 
  TextRun, 
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  VerticalAlign
} from 'docx';

export class DocumentGeneratorService {

  generateWarrantyObservationDocument(markdownContent: string): Document {
    const children: (Paragraph | Table)[] = [];
    const lines = markdownContent.split('\n');
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      

      if (line.startsWith('# ')) {
        children.push(
          new Paragraph({
            text: line.substring(2),
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          })
        );
        i++;
        continue;
      }
      

      if (line.startsWith('## ')) {
        children.push(
          new Paragraph({
            text: line.substring(3),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          })
        );
        i++;
        continue;
      }

      if (line.startsWith('### ')) {
        children.push(
          new Paragraph({
            text: line.substring(4),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 300, after: 200 },
          })
        );
        i++;
        continue;
      }
      

      if (line.startsWith('**') && line.includes(':**')) {
        const parts = line.split(':**');
        const key = parts[0].replace(/\*\*/g, '').trim();
        const value = parts.slice(1).join(':**').trim();
        
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${key}: `, bold: true }),
              new TextRun({ text: value }),
            ],
            spacing: { after: 150 },
          })
        );
        i++;
        continue;
      }
      

      if (line === '---' || line === '___') {

        children.push(
          new Paragraph({
            text: '',
            spacing: { before: 200, after: 200 },
          })
        );
        i++;
        continue;
      }
      

      if (line.startsWith('|')) {
        const tableResult = this.parseMarkdownTable(lines, i);
        if (tableResult.table) {
          children.push(tableResult.table);
        }
        i = tableResult.nextIndex;
        continue;
      }
      

      if (line.length > 0 && !line.startsWith('#') && !line.startsWith('|')) {
        children.push(
          new Paragraph({
            text: line,
            spacing: { after: 200 },
            alignment: AlignmentType.JUSTIFIED,
          })
        );
      }
      
      i++;
    }

    return new Document({
      sections: [
        {
          properties: {},
          children: children,
        },
      ],
    });
  }

  private parseMarkdownTable(lines: string[], startIndex: number): { table: Table | null; nextIndex: number } {
    const tableLines: string[] = [];
    let currentIndex = startIndex;
    
   
    while (currentIndex < lines.length && lines[currentIndex].trim().startsWith('|')) {
      tableLines.push(lines[currentIndex].trim());
      currentIndex++;
    }
    
    if (tableLines.length < 2) {
      return { table: null, nextIndex: currentIndex };
    }
    
 
    const headerLine = tableLines[0];
    const headers = headerLine
      .split('|')
      .map(h => h.trim());
    

    if (headers.length > 0 && headers[0] === '') headers.shift();
    if (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();
    

    const dataLines = tableLines.slice(2);
    

    const tableRows: TableRow[] = [];
    

    tableRows.push(
      new TableRow({
        children: headers.map(header => 
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: header || ' ', bold: header.length > 0 })],  // ← Si vacía, poner espacio sin negrita
                alignment: AlignmentType.CENTER,
              })
            ],
            shading: {
              fill: 'D3D3D3', 
            },
            verticalAlign: VerticalAlign.CENTER,
          })
        ),
      })
    );
    

    dataLines.forEach(dataLine => {
      const cells = dataLine
        .split('|')
        .map(c => c.trim());
      
      if (cells.length > 0 && cells[0] === '') cells.shift();
      if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
      

      
      if (cells.length > 0) {
        tableRows.push(
          new TableRow({
            children: cells.map(cellContent => 
              new TableCell({
                children: [
                  new Paragraph({
                    text: cellContent || ' ',  
                    alignment: AlignmentType.LEFT,
                  })
                ],
                verticalAlign: VerticalAlign.CENTER,
              })
            ),
          })
        );
      }
    });
    
    const table = new Table({
      rows: tableRows,
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1 },
        bottom: { style: BorderStyle.SINGLE, size: 1 },
        left: { style: BorderStyle.SINGLE, size: 1 },
        right: { style: BorderStyle.SINGLE, size: 1 },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
        insideVertical: { style: BorderStyle.SINGLE, size: 1 },
      },
    });
    
    return { table, nextIndex: currentIndex };
  }
}
