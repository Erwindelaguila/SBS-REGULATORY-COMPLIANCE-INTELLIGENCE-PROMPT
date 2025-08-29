import { PDFDocument, rgb } from "pdf-lib";
import { Logger } from "pino";
import { PageNotFoundError, ParagraphNotFoundError } from "../domain/errors/highlight-pdf.error";
import { PdfProcessor } from "../domain/ports/pdf-processor";

// Importar pdfjs-dist de forma compatible con Node.js
import { getDocument } from "pdfjs-dist/legacy/build/pdf";
import { TextContent, TextItem } from "pdfjs-dist/types/src/display/api";

// // Configurar para no usar worker en Node.js
// if (typeof pdfjsLib.GlobalWorkerOptions !== "undefined") {
//   pdfjsLib.GlobalWorkerOptions.workerSrc = "";
//   pdfjsLib.GlobalWorkerOptions.workerPort = null;
// }

export class PdfProcessorAdapter implements PdfProcessor {
  constructor(private readonly logger: Logger) {}

  processTextContent(textContent: TextContent) {
    const lines: Record<number, TextItem[]> = {};

    // Agrupar por líneas
    textContent.items.forEach((item) => {
      const textItem = item as TextItem;

      const y = Math.round(textItem.transform[5]);
      if (!lines[y]) {
        lines[y] = [];
      }
      lines[y].push(textItem);
    });

    const lineKeys = Object.keys(lines).map((key) => Number.parseFloat(key));
    this.logger.debug({ lineKeys }, "Line keys");

    // Ordenar cada línea horizontalmente
    lineKeys.forEach((y) => {
      lines[y].sort((a, b) => a.transform[4] - b.transform[4]);
    });

    // Combinar todas las líneas ordenadas
    const sortedText = lineKeys.sort((a, b) => b - a).map((y) => lines[y]); // Ordenar líneas de arriba a abajo
    return sortedText;
  }

  async highlightParagraph(pdfBuffer: Buffer, paragraph: string, pageNumber: number): Promise<Buffer> {
    try {
      this.logger.debug({ paragraph, pageNumber }, "Starting PDF highlight process");

      // Cargar el PDF con pdf-lib
      const pdfDoc = await PDFDocument.load(pdfBuffer);
      const pages = pdfDoc.getPages();

      // Validar que la página existe
      if (pageNumber > pages.length || pageNumber < 1) {
        throw new PageNotFoundError(`Page ${pageNumber} not found. PDF has ${pages.length} pages`);
      }

      // Cargar con pdfjs para obtener texto y coordenadas
      const uint8Array = new Uint8Array(pdfBuffer);
      const pdfjsDoc = await getDocument({
        data: uint8Array,
        verbosity: 0,
      }).promise;

      // Obtener la página específica (pdfjs usa índice 1-based)
      const pdfjsPage = await pdfjsDoc.getPage(pageNumber);
      const sortedText = this.processTextContent(await pdfjsPage.getTextContent());

      // Buscar el párrafo en la página
      const highlights = this.findTextInPage(sortedText, paragraph  );

      if (highlights.length === 0) {
        throw new ParagraphNotFoundError(
          `Paragraph not found in page ${pageNumber}: "${paragraph.substring(0, 50)}..."`,
        );
      }

      // Aplicar los highlights a la página
      const page = pages[pageNumber - 1];
      for (const highlight of highlights) {
        page.drawRectangle({
          x: Math.max(0, highlight.x),
          y: Math.max(0, highlight.y),
          width: Math.min(page.getWidth() - highlight.x, highlight.width),
          height: highlight.height,
          color: rgb(1, 0.92, 0.23), // Amarillo
          opacity: 0.35,
          borderWidth: 0,
        });
      }

      // Guardar el PDF modificado
      const pdfBytes = await pdfDoc.save();
      const buffer = Buffer.from(pdfBytes);

      this.logger.debug({ highlightCount: highlights.length }, "PDF highlighted successfully");

      return buffer;
    } catch (error) {
      if (error instanceof PageNotFoundError || error instanceof ParagraphNotFoundError) {
        throw error;
      }
      this.logger.error({ error }, "Error processing PDF");
      throw new Error(`Failed to process PDF: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  private findTextInPage(
    textContent: Array<Array<TextItem>>,
    searchText: string,
  ): Array<{ x: number; y: number; width: number; height: number }> {
    // Estrategia 1: Búsqueda exacta
    const highlights = this.findMatches(textContent, searchText);
    if (highlights.length > 0) {
      this.logger.debug(`Found ${highlights.length} matches`);
      return highlights;
    }
    return [];
  }

  private findMatches(
    textContent: Array<Array<TextItem>>,
    searchText: string,
  ): Array<{ x: number; y: number; width: number; height: number }> {
    const highlights: Array<any> = [];
    const normalizedSearch = this.normalizeText(searchText);

    // Construir texto completo de la página
    let pageText = "";
    const itemMap: Array<any> = [];

    textContent.forEach((line) => {
      line.forEach((item) => {
        const startIdx = pageText.length;
        pageText += item.str;
        itemMap.push({
          item: item,
          startIdx: startIdx,
          endIdx: pageText.length,
        });
      });
      pageText += " ";
    });

    const normalizedPage = this.normalizeText(pageText);
    // this.logger.debug({ pageText }, "Page text");
    // this.logger.debug({ normalizedPage }, "Normalized page");
    // this.logger.debug({ normalizedSearch }, "Normalized search");

    // Buscar todas las ocurrencias
    let searchIdx = 0;
    while ((searchIdx = normalizedPage.indexOf(normalizedSearch, searchIdx)) !== -1) {
      this.logger.debug({ searchIdx }, "Search index");
      const endIdx = searchIdx + normalizedSearch.length;
      const relevantItems: Array<any> = [];

      this.logger.debug({ searchIdx, endIdx }, "Search index and end index");

      for (const mapping of itemMap) {
        if (mapping.endIdx > searchIdx && mapping.startIdx < endIdx) {
          this.logger.debug({ mapping, searchIdx, endIdx }, "Mapping and search index");
          relevantItems.push(mapping.item);
        }
      }

      if (relevantItems.length > 0) {
        const lineGroups = this.groupByLines(relevantItems);
        this.logger.debug({ lineGroups }, "Line groups");
        this.logger.debug({ searchIdx }, "Search index");
        for (const line of lineGroups) {
          const highlight = this.createHighlightForLine(line);
          if (highlight) {
            highlights.push(highlight);
          }
        }
      }

      searchIdx += normalizedSearch.length;
    }

    return highlights;
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.,;:!?'"]/g, "")
      .trim();
  }

  private groupByLines(items: Array<any>): Array<Array<any>> {
    const lines: Array<Array<any>> = [];
    let currentLine: Array<any> = [];
    let lastY: number | null = null;

    const sorted = [...items].sort((a, b) => {
      const yDiff = Math.abs(a.transform[5] - b.transform[5]);
      if (yDiff > 5) {
        return b.transform[5] - a.transform[5];
      }
      return a.transform[4] - b.transform[4];
    });

    for (const item of sorted) {
      const y = item.transform[5];

      if (lastY === null || Math.abs(y - lastY) < 5) {
        currentLine.push(item);
        lastY = y;
      } else {
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = [item];
        lastY = y;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    return lines;
  }

  private createHighlightForLine(items: Array<any>): { x: number; y: number; width: number; height: number } | null {
    if (items.length === 0) return null;

    const minX = Math.min(...items.map((item) => item.transform[4]));
    const maxX = Math.max(
      ...items.map((item) => {
        const x = item.transform[4];
        const width = item.width || item.str.length * 6;
        return x + width;
      }),
    );

    const avgY = items.reduce((sum, item) => sum + item.transform[5], 0) / items.length;
    const maxHeight = Math.max(...items.map((item) => item.height || 12));

    return {
      x: minX - 2,
      y: avgY - 2,
      width: maxX - minX + 4,
      height: maxHeight + 4,
    };
  }
}
