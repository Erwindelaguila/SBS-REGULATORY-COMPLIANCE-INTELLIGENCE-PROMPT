import { BedrockRuntimeClient, ContentBlock, ConverseCommand, DocumentFormat } from "@aws-sdk/client-bedrock-runtime";
import {
  AIChatClient,
  CriterionComplianceResult,
  RecordMetadata,
  SubordinatedDebtComplianceAnalysis,
} from "../domain/ports/ai-chat.client";
import { Logger } from "pino";
import { RecordFileData } from "../domain/model/record-file-data";
import { SubordinatedDebtCriterion } from "../domain/ports/subordinated-debt-criteria.repository";
import { PDFDocument } from 'pdf-lib';
import { TextractClient, StartDocumentTextDetectionCommand, GetDocumentTextDetectionCommand } from "@aws-sdk/client-textract";

export class BedrockAIChatClient implements AIChatClient {
  private readonly textractClient: TextractClient;
  
  constructor(
    private readonly bedrockRuntimeClient: BedrockRuntimeClient,
    private readonly modelId: string,
    private readonly logger: Logger,
    private readonly s3Bucket: string,
  ) {
    this.textractClient = new TextractClient({});
  }

  private parseContentTypeToFormat(contentType: string): DocumentFormat {
    switch (contentType) {
      case "application/pdf":
        return "pdf";
      case "application/msword":
        return "doc";
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return "docx";
      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        return "xlsx";
      case "application/vnd.ms-excel":
        return "xls";
      default:
        return "txt";
    }
  }

  private removeExtension(fileName: string): string {
    const index = fileName.lastIndexOf(".");
    if (index === -1) {
      return fileName;
    }
    return fileName.substring(0, index);
  }

  private removeHyphens(str: string): string {
    return str.replace(/-/g, "");
  }

  private addUuidHyphens(str: string): string {
    return str
      .split(/(.{8})(.{4})(.{4})(.{4})(.{12})/g)!
      .filter(Boolean)
      .join("-");
  }

  async generateMetadata(
    systemPrompt: string,
    userPrompt: string,
    filesData: RecordFileData[],
  ): Promise<RecordMetadata[]> {
    try {
      const files = filesData.map(
        (fileData): ContentBlock => ({
          document: {
            name: this.removeHyphens(fileData.recordId),
            source: {
              bytes: fileData.file.bytes,
            },
            format: this.parseContentTypeToFormat(fileData.file.contentType),
          },
        }),
      );
      const converseCommand = new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: systemPrompt }],
        messages: [
          {
            role: "user",
            content: [
              {
                text: userPrompt,
              },
              ...files,
            ],
          },
        ],
      });
      const response = await this.bedrockRuntimeClient.send(converseCommand);
      this.logger.debug({ response }, "Bedrock response");

      const responseText = response.output?.message?.content?.[0]?.text;
      const parsedResponse: Array<any> = JSON.parse(responseText!);
      this.logger.debug({ parsedResponse }, "Parsed response from Bedrock to JSON");

      return parsedResponse.map((response) => ({
        recordId: this.addUuidHyphens(this.removeExtension(response.recordId)),
        metadata: response.metadata,
      }));
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error({ err }, "Failed to generate metadata");
      }
      throw err;
    }
  }

  async detectContractLanguage(pdfBytes: Uint8Array): Promise<"Local" | "Internacional"> {
    try {
      // Extraer solo las primeras 5 páginas para detectar idioma (optimización)
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const totalPages = pdfDoc.getPageCount();
      const pagesToCheck = Math.min(5, totalPages); // Máximo 5 páginas
      
      let pdfSample: Uint8Array;
      if (totalPages <= 5) {
        // Si el PDF tiene 5 páginas o menos, usar todo el documento
        pdfSample = pdfBytes;
      } else {
        // Extraer solo las primeras 5 páginas
        const sampleDoc = await PDFDocument.create();
        const pages = await sampleDoc.copyPages(pdfDoc, Array.from({ length: pagesToCheck }, (_, i) => i));
        pages.forEach((page) => sampleDoc.addPage(page));
        pdfSample = await sampleDoc.save();
      }

      this.logger.info(
        { totalPages, pagesToCheck, sampleSizeKB: (pdfSample.length / 1024).toFixed(2) },
        "Detecting language from PDF sample"
      );

      const systemPrompt = `Eres un experto lingüista. Analiza el idioma del documento PDF proporcionado.

Responde SOLO con una palabra:
- "Local" si el documento está principalmente en ESPAÑOL
- "Internacional" si el documento está principalmente en INGLÉS

No agregues explicaciones. Solo responde "Local" o "Internacional".`;

      const userPrompt = `¿En qué idioma está escrito este contrato? Responde solo "Local" (español) o "Internacional" (inglés).`;

      const converseCommand = new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: systemPrompt }],
        messages: [
          {
            role: "user",
            content: [
              { text: userPrompt },
              {
                document: {
                  name: "contrato_idioma_check",
                  source: { bytes: pdfSample },
                  format: "pdf",
                },
              },
            ],
          },
        ],
        inferenceConfig: {
          maxTokens: 10,
          temperature: 0,
        },
      });

      const response = await this.bedrockRuntimeClient.send(converseCommand);
      const responseText = response.output?.message?.content?.[0]?.text?.trim() || "";

      this.logger.info({ responseText }, "Detected contract language");

      if (responseText.toLowerCase().includes("internacional") || responseText.toLowerCase().includes("international")) {
        return "Internacional";
      }
      return "Local";
    } catch (error) {
      this.logger.error(error, "Failed to detect contract language, defaulting to Local");
      return "Local";
    }
  }

  async analyzeSubordinatedDebtCompliance(
    pdfBytes: Uint8Array,
    criteria: SubordinatedDebtCriterion[],
    s3Key?: string,
  ): Promise<SubordinatedDebtComplianceAnalysis> {
    try {
      this.logger.info(
        { totalCriteria: criteria.length },
        "Starting 2-phase analysis: extraction + evaluation",
      );

      // ═══════════════════════════════════════════════════════
      // FASE 1: Extracción de cláusulas (1 sola llamada con PDF)
      // ═══════════════════════════════════════════════════════
      this.logger.info("Phase 1: Extracting all relevant clauses from PDF");
      const extractedClauses = await this.extractContractClauses(pdfBytes, s3Key);
      this.logger.info(
        { extractedLength: extractedClauses.length },
        "Phase 1 completed: clauses extracted",
      );

      // ═══════════════════════════════════════════════════════
      // FASE 2: Evaluación por criterio (solo texto, sin PDF)
      // ═══════════════════════════════════════════════════════
      this.logger.info("Phase 2: Evaluating criteria against extracted text");
      const BATCH_SIZE = 5;
      const allResults: CriterionComplianceResult[] = [];

      for (let i = 0; i < criteria.length; i += BATCH_SIZE) {
        const batch = criteria.slice(i, i + BATCH_SIZE);
        const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(criteria.length / BATCH_SIZE);

        this.logger.info(
          { batchIndex, totalBatches, criteriaIds: batch.map(c => c.id) },
          "Evaluating criteria batch (text-only, no PDF)",
        );

        const batchResults = await Promise.all(
          batch.map(criterion => this.evaluateCriterionFromText(extractedClauses, criterion)),
        );

        allResults.push(...batchResults);

        this.logger.info(
          { batchIndex, totalBatches, completedCriteria: allResults.length },
          "Batch completed",
        );
      }

      this.logger.info(
        { totalResults: allResults.length },
        "All criteria analyzed successfully (2-phase)",
      );

      return { criterios: allResults, extractedClauses };
    } catch (error) {
      this.logger.error({ error }, "Error analyzing subordinated debt compliance");
      throw error;
    }
  }

  /**
   * System prompt reutilizable para extracción de cláusulas (FASE 1).
   */
  private getExtractionSystemPrompt(): string {
    return `Eres un experto extractor de cláusulas contractuales de instrumentos de deuda subordinada.

Tu ÚNICA tarea: Extraer y copiar TEXTUALMENTE todas las cláusulas relevantes del contrato PDF.

NO evalúes cumplimiento. NO des opiniones. Solo EXTRAE el texto literal.

EXTRAE OBLIGATORIAMENTE estas secciones (si existen):

1. DATOS GENERALES:
   - Título del contrato, partes involucradas, fecha
   - Moneda, monto del préstamo/emisión

2. OBJETO DEL PRÉSTAMO / DEFINICIONES (Cláusula 2.01, 2.02, 2.6, 2.8, Cláusula 2° o similar):
   - Texto completo
   - Si existe cláusula 2.6 "Bonos" o 2.8 "Bonos" con mención de plazo de vencimiento o referencia a artículos del Reglamento de Deuda Subordinada, COPIAR COMPLETA
   - Buscar especialmente: "valores mobiliarios representativos de deuda con plazo de vencimiento mayor a cinco (5) años"
   - 🎯 PARA CONTRATOS MARCO (Acto Marco): Buscar "Cláusula 2°" o "Cláusula Segunda" que DEFINA qué es deuda subordinada con referencia al artículo 233° de la Ley General. COPIAR COMPLETA esta cláusula.

3. FORMA DE PAGO / DESEMBOLSO (Cláusula 3.01, 3.02 o similar):
   - Cómo se pagó el instrumento (efectivo, transferencia, etc.)

4. PLAZO Y VENCIMIENTO (Cláusula 3.03 o similar):
   - Plazo total, fecha de vencimiento
   - Cualquier mención a "plazo mínimo", "mayor a X años"

5. TASAS DE INTERÉS (Cláusulas 3.04, 3.05, 4.13, 4.18 o similares):
   - Intereses compensatorios (tasa, tipo fijo/variable)
   - Intereses moratorios
   - Reajustes de tasa

5b. TIPO DE INSTRUMENTO (Cláusula 4.3, 4.29 o similar - SI EXISTE):
   - Buscar cláusula titulada "Tipo de Instrumento" o "Tipo de instrumento"
   - Si existe, COPIAR TODO el texto completo de la cláusula
   - Buscar especialmente menciones a: step-up, plazo de vencimiento, incentivos, redención anticipada, aceleración, credit-sensitive
   - Esta cláusula puede contener prohibiciones explícitas relevantes para múltiples criterios

6. PAGARÉ (Cláusula 3.11 o similar):
   - Mecanismos de llenado de pagaré
   - Condiciones de transferencia

7. RESCATE/REDENCIÓN ANTICIPADA (Cláusula 4.17, 4.23, 4.29, Section 3.5 "Prepayment" o similar):
   - Condiciones para opción de compra/rescate
   - Normativa referenciada (artículos, resoluciones SBS)
   - Prohibición de step-up
   - Aprobación SBS requerida
   - Buscar específicamente cláusula titulada "Opción de Redención Anticipada"
   - ⚠️ COPIAR TODOS los párrafos de la sección, incluyendo el párrafo de waiver que dice "Failure or delay on the part of the Lender..." (NO omitirlo)

8. MULTAS POR PAGOS ATRASADOS (Artículo 9 o similar):
   - Texto completo de la sección

9. EVENTOS DE INCUMPLIMIENTO (Cláusula 7.01, 7.02, 8 o similar - COPIAR SECCIÓN COMPLETA):
   🚨 CRÍTICO: Si existe Cláusula 8 "Eventos de Incumplimiento", copiar TODAS las subsecciones:
   - 8.1: Listado completo de eventos (8.1.1 falta de pago, 8.1.2, ... 8.1.8 intervención/disolución)
   - 8.2: Remedios para eventos NO inmediatos (8.2.1, 8.2.2 "dar por vencidos plazos", 8.2.3 restricción de pago anticipado)
   - 8.3: Remedios para evento 8.1.1 inmediato (8.3.1 literales a, b, c, ... 8.3.4 "aceleración del plazo")
   - 8.4: Evento 8.1.8 intervención/disolución (orden de prelación, aprobación SBS)
   - Cláusula 7.02 o 7.9: Restricciones de aceleración (con TODOS sus literales a, b, c y sub-numerales)
   - Buscar frases clave: "se darán por vencidos los plazos", "aceleración", "pago anticipado", "autorización previa de la SBS", "intervención o disolución"
   ⚠️ NO omitir ningún numeral - copiar la cláusula 8 COMPLETA con TODAS sus subsecciones

10. ABSORCIÓN DE PÉRDIDAS (Cláusula 7.9, 3.12 o similar):
    - Orden de prelación
    - Terminología usada (instrumentos híbridos vs representativos de capital)
    - Artículos referenciados

11. SUBORDINACIÓN (cláusula de subordinación):
    - Orden de prelación de pagos
    - Derechos en caso de liquidación

12. EVENTOS FISCALES/REGULATORIOS:
    - Condiciones de redención por eventos tributarios o regulatorios
    - Referencias a artículos del Reglamento de Deuda Subordinada

13. ESTUDIO TÉCNICO (si existe como anexo o documento dentro del PDF):
    - Buscar documento titulado "Estudio Técnico" o "Estudio Técnico – bono subordinado"
    - Copiar numeral 1.4 o cualquier numeral que mencione plazo de vencimiento
    - Copiar el plazo EXACTO mencionado (ej: "igual o mayor a 5 años", "mayor o igual a 7 años")
    - IMPORTANTE: copiar texto literal, no parafrasear

14. AMORTIZACIÓN:
    - Condiciones de amortización anticipada
    - Requisitos de aprobación SBS

15. HEDGE AGREEMENT / COBERTURA (Section 3.9 o similar, SI EXISTE en el contrato):
    - Condiciones de terminación del hedge agreement
    - Derechos de terminación del contrato por el acreedor si no se llega a acuerdo
    - Opciones de prepago o conversión de moneda
    - Copiar texto completo incluyendo sub-literales (i), (ii), (iii)

16. CONVERSIÓN DE MONEDA POST-DEFAULT (Section 8.2 o similar, SI EXISTE):
    - Conversión forzada a USD u otra moneda por eventos de incumplimiento
    - Plazos de pago tras conversión

17. ANNEXOS DEL PAGARÉ (Annex 2, Anexo C o similar, SI EXISTE):
    - 🚨 COPIAR TODO EL CONTENIDO del pagaré/promissory note, incluyendo:
    - Párrafos sobre SUBORDINACIÓN y orden de prelación ("junior in priority of payment", "senior debts", "tier 1", "tier 2")
    - Párrafos sobre ABSORCIÓN DE PÉRDIDAS ("subject to application to absorb the Borrower's losses", "pro rata and pari passu")
    - Párrafos sobre EJECUCIÓN del pagaré y aprobación SBS ("shall not proceed without prior approval")
    - Excepciones (intervención, disolución, liquidación)
    - ⚠️ Si existe versión en INGLÉS y español, copiar la versión en INGLÉS
    - ⚠️ NO omitir ningún párrafo del pagaré — copiar TODOS

18. ANNEX 1: DISBURSEMENT AND PAYMENT SCHEDULE (SI EXISTE en contratos internacionales):
    - Buscar "Annex 1" o "ANNEX 1: DISBURSEMENT AND PAYMENT SCHEDULE"
    - COPIAR la tabla completa de Principal Payment Dates
    - Incluir columnas: "Principal Payment Date", "Outstanding Principal Amount", "Principal amount due"
    - Copiar las fechas (ej: "96-month anniversary", "108-month anniversary") y montos

19. SUBORDINATED DEBT / CALIFICACIÓN COMO DEUDA SUBORDINADA (Section 17, 17.1 o similar, SI EXISTE):
    - Buscar sección que califique el préstamo como "Subordinated Debt"
    - Buscar frases: "qualifies as Subordinated Debt", "pursuant to the Regulation on Subordinated Debt"
    - COPIAR COMPLETA la sección 17.1 o equivalente

FORMATO DE SALIDA:
Para cada sección encontrada, usa este formato:

=== [NOMBRE DE SECCIÓN] ===
[número] [título tal como aparece en el documento]: [texto literal completo copiado del contrato]

Ejemplo: "3.5 Prepayment: Subject to the prior written consent..."
Ejemplo: "Cláusula 3.03—Plazo y Amortización: El Préstamo tendrá..."

Si una cláusula tiene sub-literales (a, b, c) o sub-numerales (a.1, a.2), copia TODOS.
Si una sección no existe en el contrato, escribe: "=== [NOMBRE] === No encontrada"

⚠️ REGLAS:
- Copia el texto LITERAL del contrato, no resumas
- Incluye NÚMEROS de cláusula Y su TÍTULO exactamente como aparecen en el documento original
- Si hay Artículos (ej: Artículo 9), inclúyelos con su número
- Copia sub-literales completos (a), (b), (c), (a.1), (a.2), etc.
- Copia TODOS los párrafos de cada cláusula/sección, incluyendo párrafos finales de waiver, condiciones adicionales, fees, etc. No dejes ningún párrafo fuera
- No inventes texto que no esté en el contrato`;
  }

  /**
   * Divide un PDF en chunks de páginas usando pdf-lib.
   * Retorna un array de Uint8Array, cada uno representando un PDF parcial.
   */
  private async splitPdfIntoChunks(pdfBytes: Uint8Array, chunkSize: number, overlapPages: number): Promise<Uint8Array[]> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();
    const chunks: Uint8Array[] = [];

    let startPage = 0;
    while (startPage < totalPages) {
      const endPage = Math.min(startPage + chunkSize, totalPages);
      const chunkDoc = await PDFDocument.create();
      const pageIndices = Array.from({ length: endPage - startPage }, (_, i) => startPage + i);
      const copiedPages = await chunkDoc.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach((page) => chunkDoc.addPage(page));
      chunks.push(await chunkDoc.save());

      // Avanzar con overlap para no perder cláusulas entre chunks
      startPage = endPage - overlapPages;
      // Evitar loop infinito si overlap >= chunkSize
      if (startPage >= endPage) {
        startPage = endPage;
      }
    }

    return chunks;
  }

  /**
   * Extrae cláusulas de un solo PDF (chunk o completo).
   */
  private async extractClausesFromPdfChunk(pdfChunkBytes: Uint8Array, chunkLabel: string): Promise<string> {
    const systemPrompt = this.getExtractionSystemPrompt();
    const userPrompt = `Extrae todas las cláusulas relevantes del siguiente contrato de deuda subordinada. Copia el texto literal de cada cláusula encontrada.`;

    const converseCommand = new ConverseCommand({
      modelId: this.modelId,
      system: [{ text: systemPrompt }],
      messages: [
        {
          role: "user",
          content: [
            { text: userPrompt },
            {
              document: {
                name: "contrato_deuda_subordinada",
                source: { bytes: pdfChunkBytes },
                format: "pdf",
              },
            },
          ],
        },
      ],
      inferenceConfig: {
        maxTokens: 16000,
        temperature: 0,
      },
    });

    const response = await this.bedrockRuntimeClient.send(converseCommand);
    const responseText = response.output?.message?.content?.[0]?.text;

    if (!responseText) {
      throw new Error(`No response from Bedrock during clause extraction (${chunkLabel})`);
    }

    return responseText;
  }

  /**
   * FASE 1: Extrae TODAS las cláusulas relevantes como texto.
   * Envía el PDF completo - Claude Sonnet 4 soporta hasta 200K tokens.
   */
  /**
   * Extrae texto de un PDF usando AWS Textract.
   * Útil para PDFs grandes que exceden el límite de tokens de Claude.
   */
  private async extractTextWithTextract(s3Key: string): Promise<string> {
    try {
      this.logger.info({ s3Key, bucket: this.s3Bucket }, "Starting Textract text extraction");

      // Iniciar detección de texto
      const startCommand = new StartDocumentTextDetectionCommand({
        DocumentLocation: {
          S3Object: {
            Bucket: this.s3Bucket,
            Name: s3Key,
          },
        },
      });

      const startResponse = await this.textractClient.send(startCommand);
      const jobId = startResponse.JobId;

      if (!jobId) {
        throw new Error("Textract did not return a JobId");
      }

      this.logger.info({ jobId }, "Textract job started, waiting for completion");

      // Esperar a que complete el job (polling)
      let jobStatus = 'IN_PROGRESS';
      let attempts = 0;
      const maxAttempts = 60; // 5 minutos máximo (5 segundos * 60)

      while (jobStatus === 'IN_PROGRESS' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos
        attempts++;

        const getCommand = new GetDocumentTextDetectionCommand({ JobId: jobId });
        const getResponse = await this.textractClient.send(getCommand);
        jobStatus = getResponse.JobStatus || 'FAILED';

        this.logger.info({ jobId, jobStatus, attempt: attempts }, "Textract job status");

        if (jobStatus === 'SUCCEEDED') {
          // Extraer todo el texto
          let extractedText = '';
          let nextToken = getResponse.NextToken;

          // Procesar primera página de resultados
          if (getResponse.Blocks) {
            for (const block of getResponse.Blocks) {
              if (block.BlockType === 'LINE' && block.Text) {
                extractedText += block.Text + '\n';
              }
            }
          }

          // Si hay más páginas de resultados, obtenerlas
          while (nextToken) {
            const nextCommand = new GetDocumentTextDetectionCommand({ 
              JobId: jobId,
              NextToken: nextToken 
            });
            const nextResponse = await this.textractClient.send(nextCommand);

            if (nextResponse.Blocks) {
              for (const block of nextResponse.Blocks) {
                if (block.BlockType === 'LINE' && block.Text) {
                  extractedText += block.Text + '\n';
                }
              }
            }

            nextToken = nextResponse.NextToken;
          }

          this.logger.info(
            { textLength: extractedText.length, jobId },
            "Textract extraction completed successfully"
          );

          return extractedText;
        } else if (jobStatus === 'FAILED') {
          throw new Error(`Textract job failed with status: ${getResponse.StatusMessage || 'Unknown error'}`);
        }
      }

      throw new Error(`Textract job timeout after ${attempts} attempts`);
    } catch (error) {
      this.logger.error({ error }, "Error extracting text with Textract");
      throw error;
    }
  }

  private async extractContractClauses(pdfBytes: Uint8Array, s3Key?: string): Promise<string> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();
    const sizeMB = pdfBytes.length / (1024 * 1024);

    this.logger.info(
      { totalPages, sizeKB: (pdfBytes.length / 1024).toFixed(1), sizeMB: sizeMB.toFixed(2) },
      "Extracting all clauses from PDF",
    );

    // 🚨 Si el PDF es grande (>1.5 MB o >50 páginas), usar Textract para extraer texto
    const SIZE_THRESHOLD_MB = 1.5;
    const PAGES_THRESHOLD = 50;

    if (s3Key && (sizeMB > SIZE_THRESHOLD_MB || totalPages > PAGES_THRESHOLD)) {
      this.logger.info(
        { s3Key, totalPages, sizeMB: sizeMB.toFixed(2), threshold: `${SIZE_THRESHOLD_MB} MB` },
        "PDF exceeds size/page threshold, using Textract for text extraction"
      );

      try {
        const extractedText = await this.extractTextWithTextract(s3Key);
        
        // Enviar texto extraído a Claude con el system prompt de extracción
        this.logger.info(
          { textLength: extractedText.length },
          "Sending Textract-extracted text to Claude for clause identification"
        );

        return this.extractClausesFromText(extractedText);
      } catch (error) {
        this.logger.error(
          { error },
          "Textract extraction failed, falling back to direct PDF processing"
        );
        // Si Textract falla, intentar con PDF directo (puede fallar por tamaño)
      }
    }

    // Caso normal: PDF pequeño, enviar directamente a Claude
    return this.extractClausesFromPdfChunk(pdfBytes, "complete");
  }

  /**
   * Extrae cláusulas de un texto plano (no PDF) usando Claude.
   * Util cuando el texto fue extraído previamente con Textract.
   */
  private async extractClausesFromText(extractedText: string): Promise<string> {
    const systemPrompt = this.getExtractionSystemPrompt();

    const contentBlocks: ContentBlock[] = [
      {
        text: `Contrato extraído:\n\n${extractedText}`,
      },
    ];

    const command = new ConverseCommand({
      modelId: this.modelId,
      messages: [{ role: "user", content: contentBlocks }],
      system: [{ text: systemPrompt }],
      inferenceConfig: {
        maxTokens: 50000,
        temperature: 0,
      },
    });

    const response = await this.bedrockRuntimeClient.send(command);
    const responseText = response.output?.message?.content?.[0]?.text || "";

    this.logger.info(
      { 
        inputChars: extractedText.length,
        outputChars: responseText.length,
      },
      "Claude clause extraction from Textract text completed",
    );

    return responseText;
  }

  /**
   * FASE 2: Evalúa un criterio usando SOLO texto extraído (sin PDF).
   */
  private getDefaultSystemPrompt(criterion: SubordinatedDebtCriterion): string {
    return `Eres un experto en análisis de cumplimiento regulatorio de instrumentos de deuda subordinada según normativa de Basilea III y la Resolución SBS Nº 3950-2022.

Tu tarea: Analizar las cláusulas extraídas del contrato y determinar el cumplimiento del criterio regulatorio indicado.

REGLAS GENERALES:
- Si hay contradicciones entre cláusulas → "No cumple"
- Si hay excepciones que violen el criterio → "No cumple"
- Si no hay evidencia en las cláusulas extraídas → "No cumple"

FORMATO DE SALIDA:
Responde SOLO con JSON (sin texto adicional):

{
  "id": "${criterion.id}",
  "tipo": "${criterion.tipo}",
  "basilea": "${criterion.basilea}",
  "resolucion_sbs": "${criterion.resolucion_sbs}",
  "cumplimiento": "Cumple" | "No cumple",
  "contrato": "Cláusula [número/título]: [texto de la cláusula más relevante]",
  "justificacion": "explicación detallada"
}

IMPORTANTE sobre campo "contrato":
- Empieza SIEMPRE con "Cláusula" seguido del número o título
- Incluye TODAS las cláusulas relevantes
- Si tiene sub-items (a, b, c), cópialos todos
- Cuando hay múltiples cláusulas relevantes, sepáralas con " | "
- Copia el texto completo de cada cláusula

El campo "cumplimiento" es OBLIGATORIO: debe ser "Cumple" o "No cumple" (nunca vacío).`;
  }

  private async evaluateCriterionFromText(
    extractedClauses: string,
    criterion: SubordinatedDebtCriterion,
  ): Promise<CriterionComplianceResult> {
    try {
      const systemPrompt = criterion.system_prompt || this.getDefaultSystemPrompt(criterion);

      this.logger.info(
        {
          criterionId: criterion.id,
          hasCustomPrompt: !!criterion.system_prompt,
        },
        "Evaluating criterion from extracted text",
      );

      const userPrompt = `Analiza el siguiente contrato de deuda subordinada contra este criterio regulatorio:

ID: ${criterion.id}
Tipo: ${criterion.tipo}
Basilea III: ${criterion.basilea}
Resolución SBS 3950-2022: ${criterion.resolucion_sbs}

═══════════════════════════════════════
CLÁUSULAS EXTRAÍDAS DEL CONTRATO:
═══════════════════════════════════════
${extractedClauses}
═══════════════════════════════════════

IMPORTANTE: Responde ÚNICAMENTE con el JSON en el formato especificado. No agregues texto explicativo, headers o secciones narrativas.`;

      const converseCommand = new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: systemPrompt }],
        messages: [
          {
            role: "user",
            content: [
              { text: userPrompt },
            ],
          },
        ],
        inferenceConfig: {
          maxTokens: 8000,
          temperature: 0.3,
        },
      });

      const response = await this.bedrockRuntimeClient.send(converseCommand);

      const responseText = response.output?.message?.content?.[0]?.text;
      if (!responseText) {
        throw new Error(`No response text from Bedrock for criterion ${criterion.id}`);
      }

      // Clean markdown code blocks
      let cleanedText = responseText.trim();

      const jsonBlockMatch = cleanedText.match(/```json\s*([\s\S]*?)\s*```/i);
      if (jsonBlockMatch) {
        cleanedText = jsonBlockMatch[1].trim();
      } else {
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanedText = jsonMatch[0];
        } else {
          cleanedText = cleanedText
            .replace(/^```json\s*/i, '')
            .replace(/\s*```\s*$/i, '')
            .trim();
        }
      }

      const parsed: CriterionComplianceResult = JSON.parse(cleanedText);

      this.logger.info(
        { criterionId: criterion.id, cumplimiento: parsed.cumplimiento },
        "Criterion evaluation completed",
      );

      return {
        id: criterion.id,
        tipo: criterion.tipo,
        basilea: criterion.basilea,
        resolucion_sbs: criterion.resolucion_sbs,
        cumplimiento: parsed.cumplimiento,
        contrato: parsed.contrato || '',
        justificacion: parsed.justificacion || '',
      };
    } catch (err) {
      this.logger.error({ err, criterionId: criterion.id }, "Failed to evaluate criterion");

      return {
        id: criterion.id,
        tipo: criterion.tipo,
        basilea: criterion.basilea,
        resolucion_sbs: criterion.resolucion_sbs,
        cumplimiento: "No cumple",
        contrato: '',
        justificacion: `Error al analizar este criterio: ${err instanceof Error ? err.message : 'Error desconocido'}`,
      };
    }
  }
}

