import { PDFDocument } from "pdf-lib";

export const countPdfPages = async (pdfBytes: Uint8Array): Promise<number> => {
  const document = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  return document.getPageCount();
};

export type PageChunk = {
  from: number;
  to: number;
  text: string;
};

export const chunkPages = (pages: string[], pagesPerChunk: number, overlapPages: number): PageChunk[] => {
  if (pages.length === 0) {
    return [];
  }
  const step = Math.max(1, pagesPerChunk - overlapPages);
  const chunks: PageChunk[] = [];
  for (let start = 0; start < pages.length; start += step) {
    const end = Math.min(start + pagesPerChunk, pages.length);
    chunks.push({ from: start + 1, to: end, text: pages.slice(start, end).join("\n") });
    if (end === pages.length) {
      break;
    }
  }
  return chunks;
};
