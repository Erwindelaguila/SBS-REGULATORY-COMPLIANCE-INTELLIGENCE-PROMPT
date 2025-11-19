import { Packer } from "docx";
import { DocumentGeneratorService } from "../services/document-generator.service";

/**
 * Entrypoint para generar documentos Word de WARRANTY
 * Recibe Markdown y devuelve buffer del documento .docx
 */
export class GenerateWarrantyDocumentEntrypoint {
  private documentGenerator: DocumentGeneratorService;

  constructor() {
    this.documentGenerator = new DocumentGeneratorService();
  }

  /**
   * Genera documento Word a partir de contenido Markdown
   * @param markdownContent - Contenido en formato Markdown
   * @returns Buffer del documento Word generado y nombre del archivo
   */
  async execute(markdownContent: string): Promise<{ buffer: Buffer; filename: string }> {
    // Generar documento Word usando el servicio
    const doc = this.documentGenerator.generateWarrantyObservationDocument(markdownContent);

    // Convertir documento a buffer
    const buffer = await Packer.toBuffer(doc);

    // Extraer período del markdown para el nombre del archivo
    const periodMatch = markdownContent.match(/Período:\s*([^\n]+)/);
    const period = periodMatch ? periodMatch[1].trim().replace(/\s+/g, "-") : "documento";

    const filename = `observacion-garantias-${period}.docx`;

    return {
      buffer,
      filename,
    };
  }
}
