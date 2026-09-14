import { describe, expect, it } from "@jest/globals";
import { PDFDocument } from "pdf-lib";
import { chunkPages, countPdfPages } from "../../source/domain/pdf-pages";

const pages = (count: number): string[] => Array.from({ length: count }, (_, i) => `pagina ${i + 1}`);

describe("chunkPages", () => {
  it("returns nothing for an empty document", () => {
    expect(chunkPages([], 50, 2)).toEqual([]);
  });

  it("keeps a short document in a single chunk", () => {
    const chunks = chunkPages(pages(23), 50, 2);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ from: 1, to: 23 });
  });

  it("splits a long document with overlapping page ranges", () => {
    const chunks = chunkPages(pages(104), 50, 2);
    expect(chunks.map((c) => [c.from, c.to])).toEqual([
      [1, 50],
      [49, 98],
      [97, 104],
    ]);
  });

  it("covers exactly two hundred pages in five chunks of at most fifty", () => {
    const chunks = chunkPages(pages(200), 50, 2);
    expect(chunks).toHaveLength(5);
    expect(chunks[0].from).toBe(1);
    expect(chunks[chunks.length - 1].to).toBe(200);
    expect(chunks.every((c) => c.to - c.from + 1 <= 50)).toBe(true);
  });

  it("never loops when the overlap is not smaller than the chunk", () => {
    const chunks = chunkPages(pages(5), 2, 2);
    expect(chunks[chunks.length - 1].to).toBe(5);
    expect(chunks.length).toBeLessThanOrEqual(5);
  });
});

describe("countPdfPages", () => {
  it("counts the pages of a real pdf", async () => {
    const document = await PDFDocument.create();
    for (let i = 0; i < 7; i += 1) {
      document.addPage();
    }
    const bytes = await document.save();
    expect(await countPdfPages(bytes)).toBe(7);
  });
});
