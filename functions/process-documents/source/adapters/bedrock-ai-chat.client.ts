import { BedrockRuntimeClient, ContentBlock, ConverseCommand, DocumentFormat } from "@aws-sdk/client-bedrock-runtime";
import {
  AIChatClient,
  RecordMetadata,
  SubordinatedDebtComplianceAnalysis,
} from "../domain/ports/ai-chat.client";
import { Logger } from "pino";
import { RecordFileData } from "../domain/model/record-file-data";
import { SubordinatedDebtCriterion } from "../domain/ports/subordinated-debt-criteria.repository";

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

  async analyzeSubordinatedDebtCompliance(
    pdfBytes: Uint8Array,
    criteria: SubordinatedDebtCriterion[],
  ): Promise<SubordinatedDebtComplianceAnalysis> {
    try {
      const systemPrompt = `Eres un experto en análisis de cumplimiento regulatorio de instrumentos de deuda subordinada según normativa de Basilea III y la Resolución SBS Nº 3950-2022.

Tu tarea es analizar el contrato de deuda subordinada proporcionado y determinar el cumplimiento de cada criterio regulatorio.

Para CADA criterio debes:
1. Buscar evidencia en el documento (fragmentos de texto exactos)
2. Determinar si cumple o no cumple
3. Proporcionar justificación clara

REGLAS DE EVALUACIÓN CRÍTICAS:
- Si la "Resolución SBS 3950-2022" dice "undefined", "null", o está vacía → SIEMPRE marca como "No cumple"
- Si NO encuentras la cláusula específica en el contrato → marca como "No cumple"
- SOLO marca "Cumple" si AMBOS criterios están claramente definidos Y el contrato los cumple

IMPORTANTE: Tu respuesta DEBE ser un objeto JSON válido con la siguiente estructura exacta:
{
  "criterios": [
    {
      "id": "1",
      "tipo": "Local",
      "basilea": "texto del criterio basilea",
      "resolucion_sbs": "texto del criterio SBS o 'undefined' si no existe",
      "cumplimiento": "Cumple" | "No cumple",
      "contrato": "Cláusula X.Y: texto exacto del documento que evidencia el cumplimiento o incumplimiento, DEBE COMENZAR con el número de cláusula si existe (ej: 'Cláusula 4.26: texto...')",
      "justificacion": "explicación breve de por qué cumple o no cumple"
    }
  ]
}

IMPORTANTE sobre el campo 'contrato': 
- SIEMPRE debe incluir la referencia de la cláusula al inicio si existe en el documento (ejemplo: "Cláusula 4.26: texto...")
- Si el texto está en múltiples cláusulas, incluye todas las referencias
- Si no hay número de cláusula explícito, simplemente incluye el texto encontrado o "No se encontró información específica"

Responde SOLO con el JSON. Sin texto adicional antes o después.`;

      const criteriaText = criteria
        .map(
          (c) =>
            `ID: ${c.id}\nTipo: ${c.tipo}\nBasilea III: ${c.basilea}\nResolución SBS 3950-2022: ${c.resolucion_sbs}\n`,
        )
        .join("\n---\n\n");

      const userPrompt = `Analiza el siguiente contrato de deuda subordinada contra estos ${criteria.length} criterios regulatorios:

${criteriaText}

Proporciona el análisis de cumplimiento en formato JSON según las instrucciones del sistema.`;

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
          temperature: 0,
        },
      });

      const response = await this.bedrockRuntimeClient.send(converseCommand);
      this.logger.debug({ response }, "Bedrock response for subordinated debt analysis");

      const responseText = response.output?.message?.content?.[0]?.text;
      if (!responseText) {
        throw new Error("No response text from Bedrock");
      }

      // Limpiar markdown code blocks si existen
      const cleanedText = responseText
        .replace(/^```json\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

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
