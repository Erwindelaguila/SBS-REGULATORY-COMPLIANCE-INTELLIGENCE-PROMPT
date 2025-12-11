import { Packer } from "docx";
import { DocumentGeneratorService } from "../services/document-generator.service";


export class GenerateWarrantyDocumentEntrypoint {
  private documentGenerator: DocumentGeneratorService;

  constructor() {
    this.documentGenerator = new DocumentGeneratorService();
  }

  async execute(markdownContent: string): Promise<{ buffer: Buffer; filename: string }> {

    const doc = this.documentGenerator.generateWarrantyObservationDocument(markdownContent);
    const buffer = await Packer.toBuffer(doc);
    const periodMatch = markdownContent.match(/Período:\s*([^\n]+)/);
    const period = periodMatch ? periodMatch[1].trim().replace(/\s+/g, "-") : "documento";

    const filename = `observacion-garantias-${period}.docx`;

    return {
      buffer,
      filename,
    };
  }
}
