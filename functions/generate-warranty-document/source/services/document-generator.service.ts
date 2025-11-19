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
  /**
   * Genera un documento Word a partir de Markdown
   */
  generateWarrantyObservationDocument(markdownContent: string): Document {
    const children: (Paragraph | Table)[] = [];
    const lines = markdownContent.split('\n');
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Título principal (# ...)
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
      
      // Encabezados nivel 2 (## ...)
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
      
      // Encabezados nivel 3 (### ...)
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
      
      // Metadatos con formato **Clave:** valor
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
      
      // Separadores horizontales (---)
      if (line === '---' || line === '___') {
        // Simplemente añadir espacio
        children.push(
          new Paragraph({
            text: '',
            spacing: { before: 200, after: 200 },
          })
        );
        i++;
        continue;
      }
      
      // Detección de tablas (línea que empieza con |)
      if (line.startsWith('|')) {
        const tableResult = this.parseMarkdownTable(lines, i);
        if (tableResult.table) {
          children.push(tableResult.table);
        }
        i = tableResult.nextIndex;
        continue;
      }
      
      // Texto normal (párrafos)
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

    // Crear documento
    return new Document({
      sections: [
        {
          properties: {},
          children: children,
        },
      ],
    });
  }

  /**
   * Parsea una tabla Markdown y la convierte a tabla de Word
   */
  private parseMarkdownTable(lines: string[], startIndex: number): { table: Table | null; nextIndex: number } {
    const tableLines: string[] = [];
    let currentIndex = startIndex;
    
    // Recoger todas las líneas de la tabla
    while (currentIndex < lines.length && lines[currentIndex].trim().startsWith('|')) {
      tableLines.push(lines[currentIndex].trim());
      currentIndex++;
    }
    
    if (tableLines.length < 2) {
      return { table: null, nextIndex: currentIndex };
    }
    
    // La primera línea son los encabezados
    const headerLine = tableLines[0];
    const headers = headerLine
      .split('|')
      .map(h => h.trim());
    
    // Remover primer y último elemento si están vacíos (son los | externos)
    if (headers.length > 0 && headers[0] === '') headers.shift();
    if (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();
    
    // NO filtrar celdas vacías - mantenerlas para preservar la estructura
    // .filter(h => h.length > 0);  ← ELIMINADO: esto borraba las celdas vacías
    
    // La segunda línea es el separador (ignorarla)
    // Las demás líneas son datos
    const dataLines = tableLines.slice(2);
    
    // Crear filas de tabla
    const tableRows: TableRow[] = [];
    
    // Fila de encabezado
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
              fill: 'D3D3D3', // Gris claro para encabezados
            },
            verticalAlign: VerticalAlign.CENTER,
          })
        ),
      })
    );
    
    // Filas de datos
    dataLines.forEach(dataLine => {
      const cells = dataLine
        .split('|')
        .map(c => c.trim());
      
      // Remover primer y último elemento si están vacíos (son los | externos)
      if (cells.length > 0 && cells[0] === '') cells.shift();
      if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
      
      // NO filtrar celdas vacías - mantenerlas para preservar la estructura
      // .filter(c => c.length > 0);  ← ELIMINADO
      
      if (cells.length > 0) {
        tableRows.push(
          new TableRow({
            children: cells.map(cellContent => 
              new TableCell({
                children: [
                  new Paragraph({
                    text: cellContent || ' ',  // ← Si está vacía, poner un espacio
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
