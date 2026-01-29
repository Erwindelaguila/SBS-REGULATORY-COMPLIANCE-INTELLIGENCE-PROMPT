import { BedrockRuntimeClient, ContentBlock, ConverseCommand, DocumentFormat } from "@aws-sdk/client-bedrock-runtime";
import {
  AIChatClient,
  RecordMetadata,
  SubordinatedDebtComplianceAnalysis,
} from "../domain/ports/ai-chat.client";
import { Logger } from "pino";
import { RecordFileData } from "../domain/model/record-file-data";
import { SubordinatedDebtCriterion } from "../domain/ports/subordinated-debt-criteria.repository";
import { PDFDocument } from 'pdf-lib';

export class BedrockAIChatClient implements AIChatClient {
  constructor(
    private readonly bedrockRuntimeClient: BedrockRuntimeClient,
    private readonly modelId: string,
    private readonly logger: Logger,
  ) {}

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
  ): Promise<SubordinatedDebtComplianceAnalysis> {
    try {
      const pdfSizeMB = pdfBytes.length / (1024 * 1024);
      
      if (pdfSizeMB > 1.5) {
        this.logger.info({ pdfSizeMB: pdfSizeMB.toFixed(2), criteriaCount: criteria.length }, "Large PDF detected - using page chunking");
        
        const chunks = await this.splitPDFIntoPageChunks(pdfBytes, 30);
        this.logger.info({ totalChunks: chunks.length }, "PDF split into chunks");
        
        const allResults: SubordinatedDebtCriterion[][] = [];
        
        for (let i = 0; i < chunks.length; i++) {
          this.logger.info({ chunkIndex: i + 1, totalChunks: chunks.length }, "Processing chunk");
          const chunkResult = await this.analyzeBatch(chunks[i], criteria);
          allResults.push(chunkResult.criterios);
          this.logger.info({ chunkIndex: i + 1, resultsReceived: chunkResult.criterios.length }, "Chunk completed");
        }
        
        return this.mergeChunkResults(allResults, criteria);
      }
      
      return await this.analyzeBatch(pdfBytes, criteria);
    } catch (error) {
      this.logger.error({ error }, "Error analyzing subordinated debt compliance");
      throw error;
    }
  }

  private async splitPDFIntoPageChunks(pdfBytes: Uint8Array, pagesPerChunk: number): Promise<Uint8Array[]> {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const totalPages = pdfDoc.getPageCount();
    const chunks: Uint8Array[] = [];

    for (let i = 0; i < totalPages; i += pagesPerChunk) {
      const chunkDoc = await PDFDocument.create();
      const endPage = Math.min(i + pagesPerChunk, totalPages);
      
      const pagesToCopy = await chunkDoc.copyPages(pdfDoc, Array.from({ length: endPage - i }, (_, k) => i + k));
      pagesToCopy.forEach(page => chunkDoc.addPage(page));
      
      chunks.push(await chunkDoc.save());
    }

    return chunks;
  }

  private mergeChunkResults(
    chunkResults: SubordinatedDebtCriterion[][], 
    originalCriteria: SubordinatedDebtCriterion[]
  ): SubordinatedDebtComplianceAnalysis {
    const mergedCriteria: SubordinatedDebtCriterion[] = [];

    for (const criterio of originalCriteria) {
      const criterioResults = chunkResults
        .map(chunk => chunk.find(c => c.id === criterio.id))
        .filter(c => c !== undefined);

      if (criterioResults.length === 0) {
        mergedCriteria.push({ ...criterio, cumplimiento: 'No cumple', contrato: '', justificacion: 'No encontrado en el documento' });
        continue;
      }

      const hasCumple = criterioResults.some(c => c.cumplimiento === 'Cumple');
      const allTexts = criterioResults.map(c => c.contrato).filter(t => t).join(' | ');
      
      // Unificar justificaciones sin mencionar chunks
      const allJustifications = criterioResults
        .map(c => c.justificacion)
        .filter(j => j && j.trim())
        .join(' ');

      mergedCriteria.push({
        id: criterio.id,
        tipo: criterio.tipo,
        basilea: criterio.basilea,
        resolucion_sbs: criterio.resolucion_sbs,
        cumplimiento: hasCumple ? 'Cumple' : 'No cumple',
        contrato: allTexts,
        justificacion: allJustifications
      });
    }

    return { criterios: mergedCriteria };
  }

  private async analyzeBatch(
    pdfBytes: Uint8Array,
    criteria: SubordinatedDebtCriterion[],
  ): Promise<SubordinatedDebtComplianceAnalysis> {
    try {
      const systemPrompt = `Eres un experto en análisis de cumplimiento regulatorio de instrumentos de deuda subordinada según normativa de Basilea III y la Resolución SBS Nº 3950-2022.

Tu tarea: Analizar el contrato y determinar cumplimiento de cada criterio. Lee el documento COMPLETO antes de evaluar.

PRE-VALIDACIONES OBLIGATORIAS (aplicar PRIMERO):

1. CRITERIO ID="2a" - Vencimiento Mínimo 5 Años:
   ⚠️ VALIDACIÓN DE REDACCIÓN CLARA: EL PLAZO MÍNIMO DEBE SER EXPLÍCITO
   
   PASO 1: Buscar "Estudio Técnico"
   Escanea TODO el PDF buscando documento/anexo titulado "Estudio Técnico"
   
   PASO 2: DETECTAR REDACCIÓN AMBIGUA EN CLÁUSULA 4.4
   ⚠️ CRÍTICO: Buscar frases que establezcan límites inferiores de plazo
   
   Frases problemáticas que generan ambigüedad:
   - "mayor a un año" → Aunque 10 años cumple esto, NO es suficientemente claro para regulación
   - "mayor a dos años" → Idem
   - "mayor a tres años" → Idem
   - "mayor a cuatro años" → Idem
   
   ❌ DEFECTO DE REDACCIÓN DETECTADO:
   Si encuentras SIMULTÁNEAMENTE:
   - Una frase: "plazo de vencimiento mayor a un año"
   - Otra frase: "plazo de vencimiento original será igual a diez (10) años"
   
   Entonces → "No cumple" por AMBIGÜEDAD REGULATORIA
   
   ⚠️ Aunque matemáticamente 10 años > 1 año, la primera frase no establece claramente el mínimo de 5 años requerido por la regulación.
   
   Justificación:
   "Si bien el numeral 5 de la cláusula 4.4 señala que el plazo de vencimiento original será de 10 años, la primera sección también señala que el plazo de vencimiento es mayor a 1 año, propiciando confusión. La primera sección debe modificarse y señalar que el plazo de vencimiento es mayor a 5 años para adecuarse al Reglamento."
   
   PASO 3: VALIDACIÓN NUMÉRICA
   
   CASO A - SI existe Estudio Técnico:
   - Comparar plazo Acto Marco vs Estudio Técnico
   - Si son diferentes → "No cumple"
   
   CASO B - SI NO existe Estudio Técnico:
   
   ✅ Redacción CORRECTA (marca "Cumple"):
   - "plazo de vencimiento mayor a cinco años... será igual a diez (10) años"
   - "plazo de vencimiento de diez (10) años" (sin mención de límite inferior)
   - "plazo mínimo de cinco años... será igual a diez (10) años"
   
   ❌ Redacción AMBIGUA (marca "No cumple"):
   - "mayor a un año" + "diez años" → Contradicción por ambigüedad
   - "mayor a tres años" + "diez años" → Contradicción por ambigüedad

2. CRITERIO ID="2b" - No Step-Up:
   ⚠️ CRÍTICO: Debes buscar específicamente la Cláusula 4.29 PRIMERO antes de buscar otras.
   
   ORDEN DE BÚSQUEDA OBLIGATORIO:
   1. **PRIMERO**: Buscar "Cláusula 4.29" o "4.29" sobre "Rescate anticipado" o "amortización anticipada"
      - Frase clave: "El Emisor no incluirá en los contratos complementarios step-up u otros incentivos"
      - Si encuentras esta frase → DETENTE → "Cumple"
   
   2. Si NO encuentras 4.29, buscar:
      - Cláusula 4.13 (Tasa de interés)
      - Cláusula 4.18 (Tasa de interés)
      - Cualquier cláusula sobre "step-up"
   
   ⚠️ REGLA CRÍTICA - VERIFICACIÓN EXHAUSTIVA:
   - La Cláusula 4.29 debe existir en muchos contratos recientes
   - Leer TODO el texto de Cláusula 4.29 buscando: "no incluirá step-up"
   - NO te detengas en 4.13 si dice "la tasa se determinará". Sigue buscando en 4.29.
   
   DECISIÓN:
   - Si encuentras prohibición explícita en CUALQUIER cláusula (especialmente 4.29) → "Cumple"
   - Si NO encuentras prohibición en ninguna parte → "No cumple"

3. CRITERIO ID="3" - Opción de Compra después de 5 años:
   ⚠️ VALIDACIÓN DE NORMATIVA VIGENTE (OBLIGATORIA):
   
   El contrato DEBE referenciar el REGLAMENTO VIGENTE: Resolución SBS 3950-2022, artículo 17-3
   
   BUSCA en la Cláusula 4.17 o cláusula de rescate/redención:
   - ✅ CORRECTO: "artículo 17-3", "Resolución 3950-2022", "artículo 17"
   - ❌ INCORRECTO: "artículo 3°", "artículo 16°", "Resolución 975-2016"
   
   DECISIÓN:
   - Si cita SOLO "artículo 3°" o "artículo 16°" SIN mencionar "3950-2022" → "No cumple"
   - Si cita "Resolución 975-2016" → "No cumple"
   
   CASO REAL DE NO CUMPLIMIENTO:
   Contrato: "conforme lo establece el numeral 6 del artículo 3° y el segundo párrafo del numeral 1 del Artículo 16° del Reglamento de deuda subordinada"
   
   Resultado: NO CUMPLE
   Justificación: "El base legal definido en la cláusula 4.17 no está en función al nuevo Reglamento de Deuda Subordinada (Resolución S.B.S. N° 03950-2022). Se hace referencia a artículos del reglamento derogado en lugar del artículo 17-3 del reglamento vigente."

4. CRITERIO ID="7" - Absorción de Pérdidas:
   ⚠️ VALIDACIÓN DE NORMATIVA Y TERMINOLOGÍA VIGENTE (OBLIGATORIA):
   
   PASO 1: Buscar la cláusula sobre absorción de pérdidas (típicamente Cláusula 7.9)
   
   PASO 2: Verificar TERMINOLOGÍA usada:
   ❌ TERMINOLOGÍA OBSOLETA (Resolución 975-2016, artículo 16°):
   - "instrumentos híbridos representativos de capital y de deuda"
   - "instrumentos no híbridos representativos de capital"
   - Si encuentras estas frases → "No cumple"
   
   ✅ TERMINOLOGÍA VIGENTE (Resolución 3950-2022, artículo 18-6):
   - "instrumentos representativos de capital computables en el patrimonio efectivo de nivel 2"
   - SIN mencionar "híbridos" o "no híbridos"
   
   DECISIÓN:
   - Si usa "instrumentos híbridos" o "instrumentos no híbridos" → "No cumple"
   - Si cita "Resolución 975-2016" o "artículo 16" sin "3950-2022" → "No cumple"
   - Si usa terminología vigente y menciona correcto orden de prelación → "Cumple"
   
   CASO REAL DE NO CUMPLIMIENTO:
   Cláusula 7° (7.9): "...los instrumentos híbridos representativos de capital y de deuda computables en el patrimonio efectivo de nivel 2, y los instrumentos no híbridos representativos de capital..."
   
   Resultado: NO CUMPLE
   Justificación: "La cláusula 7° (7.9) no se adecúa al numeral 6 del artículo 18° del nuevo Reglamento de Deuda Subordinada (Resolución S.B.S. N° 03950-2022), sino que utiliza la terminología de la normativa derogada (Resolución S.B.S. N° 975-2016). Debe usar 'instrumentos representativos de capital' en lugar de 'instrumentos híbridos' e 'instrumentos no híbridos'."

5. CRITERIO ID="4" - No Aceleración de Pagos:
   ⚠️ VALIDACIÓN EN DOS PASOS CON DETECCIÓN DE CONTRADICCIONES:
   
   PASO 1: Buscar Cláusula 7.9
   Debe decir: "El tenedor no tiene derecho para acelerar pagos futuros pactados, excepto en caso de intervención, o disolución y liquidación"
   
   PASO 2: Buscar Cláusula 8 "Eventos de Incumplimiento" - REVISAR TODAS LAS SUBCLÁUSULAS
   ⚠️ CRÍTICO: Buscar específicamente estas cláusulas problemáticas:
   
   ❌ CLÁUSULA 8.2.2(i): "se darán por vencidos los plazos de pago de los Bonos en circulación"
      - Esto permite aceleración por eventos NO permitidos (fuera de intervención/disolución/liquidación)
      - Si encuentras esto → "No cumple"
   
   ❌ CLÁUSULA 8.3.4: "los titulares de los Bonos tendrán derecho a solicitar que se declare la aceleración del plazo de vencimientos"
      - Esto permite aceleración por incumplimiento de pago (8.1.1) que NO es un evento permitido
      - Si encuentras esto → "No cumple"
   
   ❌ CLÁUSULA 8.4: Referencias a "artículo 16 del Reglamento" en lugar de "artículo 18"
      - Esto es normativa obsoleta
   
   DECISIÓN:
   - Si Cláusula 8 contiene 8.2.2(i) o 8.3.4 que permiten aceleración indebida → "No cumple"
   - Justificación: "Las cláusulas 8.2.2(i), 8.2.3, 8.3.1 y 8.3.4 permiten aceleración de pagos por eventos distintos a intervención, disolución y liquidación, lo que contradice el artículo 18-4 del Reglamento."
   
   - Si Cláusula 8.2 solo REPITE textualmente la restricción de 7.9 sin agregar excepciones → "Cumple"

6. CRITERIO ID="3b" - Tax/Regulatory Events:
   ⚠️ VALIDACIÓN EN DOS NIVELES:
   
   NIVEL 1: Referencias Implícitas
   Si el contrato referencia CUALQUIERA de estos:
   - "artículo 3° del Reglamento de Deuda Subordinada"
   - "artículo 17.3 del Reglamento"
   - "numeral 6 del artículo 3°"
   
   Entonces el contrato INCLUYE IMPLÍCITAMENTE el artículo 17.4 sobre tax/regulatory events.
   
   NIVEL 2: Cláusulas de Redención Anticipada
   Buscar en Cláusula 4.17 o cláusulas de rescate/redención texto como:
   - "deberá abstenerse de generar expectativas de que la opción de rescate será ejercida"
   - "no deberá ejercer la opción de redención anticipada a menos que se produzca un evento fiscal o regulatorio"
   - "evento fiscal que afecte la computabilidad de los instrumentos"
   - "evento regulatorio que impida el cómputo del instrumento"
   
   DECISIÓN:
   - Si referencia artículo 3° o 17.3 Y/O describe condiciones tax/regulatory → "Cumple"
   - Justificación: "El contrato incluye disposiciones sobre eventos fiscales y regulatorios, ya sea mediante referencia al artículo [X] del Reglamento o mediante cláusulas que describen las condiciones para redención anticipada por eventos fiscales/regulatorios."
   
   ⚠️ NO marcar "No cumple" si encuentra CUALQUIERA de los dos niveles de validación.

REGLAS GENERALES:
- Lee el documento COMPLETO (incluye TODOS los anexos, promissory notes, hedge agreements)
- Si hay contradicciones entre cláusulas → "No cumple"
- Si hay excepciones que violen el criterio → "No cumple"
- Si "Resolución SBS" es undefined/null/vacía → "No cumple"
- Si no hay evidencia → "No cumple"
- Busca cláusulas que contradigan Y que apoyen el cumplimiento antes de decidir

FORMATO DE SALIDA:
Responde SOLO con JSON (sin texto adicional):

{
  "criterios": [
    {
      "id": "1",
      "tipo": "Local",
      "basilea": "texto del criterio",
      "resolucion_sbs": "texto del criterio",
      "cumplimiento": "Cumple" | "No cumple",
      "contrato": "Cláusula [número/título]: [texto de la cláusula más relevante]",
      "justificacion": "explicación detallada"
    }
  ]
}

IMPORTANTE sobre campo "contrato":
- Empieza SIEMPRE con "Cláusula" seguido del número o título
- Copia el texto completo de la cláusula principal
- Si tiene sub-items (a, b, c), cópialos todos
- NUNCA uses "Página X:" o inventes números
- Ejemplos correctos: "Cláusula 4.19: texto...", "Cláusula Segunda: texto...", "Cláusula Events of Default: texto..."

El campo "cumplimiento" es OBLIGATORIO: debe ser "Cumple" o "No cumple" (nunca vacío).`;

      const criteriaText = criteria
        .map(
          (c) =>
            `ID: ${c.id}\nTipo: ${c.tipo}\nBasilea III: ${c.basilea}\nResolución SBS 3950-2022: ${c.resolucion_sbs}\n`,
        )
        .join("\n---\n\n");

      const userPrompt = `Analiza el siguiente contrato de deuda subordinada contra estos ${criteria.length} criterios regulatorios:

${criteriaText}

IMPORTANTE: Responde ÚNICAMENTE con el JSON en el formato especificado. No agregues texto explicativo, headers o secciones narrativas.`;

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
              {
                document: {
                  name: "contrato_deuda_subordinada",
                  source: {
                    bytes: pdfBytes,
                  },
                  format: "pdf",
                },
              },
            ],
          },
        ],
        inferenceConfig: {
          maxTokens: 20000,
          temperature: 0.7,
        },
      });

      const response = await this.bedrockRuntimeClient.send(converseCommand);
      this.logger.debug({ response }, "Bedrock response for subordinated debt analysis");

      const responseText = response.output?.message?.content?.[0]?.text;
      if (!responseText) {
        throw new Error("No response text from Bedrock");
      }

      // Limpiar markdown code blocks y cualquier texto decorativo
      let cleanedText = responseText.trim();
      
      // Buscar el bloque de código JSON
      const jsonBlockMatch = cleanedText.match(/```json\s*([\s\S]*?)\s*```/i);
      if (jsonBlockMatch) {
        cleanedText = jsonBlockMatch[1].trim();
      } else {
        // Si no hay bloque de código, intentar encontrar el JSON directamente
        // Buscar desde el primer { hasta el último }
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanedText = jsonMatch[0];
        } else {
          // Fallback: remover markdown básico
          cleanedText = cleanedText
            .replace(/^```json\s*/i, '')
            .replace(/\s*```\s*$/i, '')
            .trim();
        }
      }

      const parsedResponse: SubordinatedDebtComplianceAnalysis = JSON.parse(cleanedText);
      this.logger.info(
        { criteriaCount: parsedResponse.criterios?.length },
        "Parsed subordinated debt compliance analysis",
      );

      return parsedResponse;
    } catch (err) {
      if (err instanceof Error) {
        this.logger.error({ err }, "Failed to analyze subordinated debt compliance");
      }
      throw err;
    }
  }
}
