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

type HighLightCoordinate = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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

    // Ordenar líneas verticalmente
    const lineKeys = Object.keys(lines)
      .map((key) => Number.parseFloat(key))
      .sort((a, b) => b - a);

    // Ordenar cada línea horizontalmente
    lineKeys.forEach((y) => {
      lines[y].sort((a, b) => a.transform[4] - b.transform[4]);
    });

    // Obtener texto ordenado
    const sortedText = lineKeys.map((y) => lines[y]); // Ordenar líneas de arriba a abajo
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
      const highlights = this.findMatches(sortedText, paragraph);

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

  private findMatches(textContent: Array<Array<TextItem>>, searchText: string): Array<HighLightCoordinate> {
    // Construir texto completo de la página
    let normalizedPage = "";
    const itemMap: Array<{ item: TextItem; startIdx: number; endIdx: number; lineIdx: number; itemIdx: number }> = [];

    textContent.forEach((line, lineIdx) => {
      line.forEach((item, itemIdx) => {
        const startIdx = normalizedPage.length;
        normalizedPage += this.normalizeText(item.str);
        itemMap.push({
          item: item,
          startIdx: startIdx,
          endIdx: normalizedPage.length,
          lineIdx: lineIdx,
          itemIdx: itemIdx,
        });
      });
      normalizedPage += " ";
    });

    const normalizedSearch = this.normalizeText(searchText);

    // this.logger.debug({ pageText }, "Page text");
    // this.logger.debug({ normalizedPage }, "Normalized page");
    // this.logger.debug({ normalizedSearch }, "Normalized search");

    const searchIdx = normalizedPage.indexOf(normalizedSearch);
    const endIdx = searchIdx + normalizedSearch.length;
    this.logger.debug({ searchIdx, endIdx }, "Search index and end index");

    let startHighlight = false;
    let endHighlight = false;

    const relevantItemIndexes = new Map<number, Array<number>>();

    for (const mapping of itemMap) {
      if (mapping.startIdx >= searchIdx && !endHighlight) {
        if (mapping.endIdx <= endIdx) {
          startHighlight = true;
        } else {
          // If last line is not complete, check if the search text is in the last line to highlight
          startHighlight = this.normalizeText(mapping.item.str).includes(normalizedSearch);
          endHighlight = !startHighlight;
        }
      }

      if (startHighlight) {
        this.logger.debug(
          {
            mapping,
            searchIdx,
            endIdx,
            startHighlight,
            endHighlight,
          },
          "Mapping and search index",
        );

        if (!relevantItemIndexes.has(mapping.lineIdx)) {
          relevantItemIndexes.set(mapping.lineIdx, [mapping.itemIdx]);
        } else {
          const lineIndexes = relevantItemIndexes.get(mapping.lineIdx)!;
          lineIndexes.push(mapping.itemIdx);
          relevantItemIndexes.set(mapping.lineIdx, lineIndexes);
        }
      }
    }

    let highlights: Array<HighLightCoordinate> = [];

    // console.log("Relevant item indexes", relevantItemIndexes);

    if (relevantItemIndexes.size > 0) {
      highlights = Array.from(relevantItemIndexes.entries())
        .map(([lineIdx, itemIndexes]) => {
          const line = textContent[lineIdx].filter((_, itemIdx) => itemIndexes.includes(itemIdx));
          return this.createHighlightForLine(line);
        })
        .filter((highlight) => highlight !== null);
    }

    this.logger.debug(`Found ${highlights.length} matches`);
    return highlights;
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.,;:!?'"]/g, "")
      .trim();
  }

  private createHighlightForLine(items: Array<any>): HighLightCoordinate | null {
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
