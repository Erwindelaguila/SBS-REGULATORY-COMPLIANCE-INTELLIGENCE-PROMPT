export interface HighlightResult {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfProcessor {
  highlightParagraph(
    pdfBuffer: Buffer, 
    paragraph: string, 
    pageNumber: number
  ): Promise<Buffer>;
}