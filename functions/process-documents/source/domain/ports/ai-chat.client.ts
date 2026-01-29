import { RecordFileData } from "../model/record-file-data";
import { SubordinatedDebtCriterion } from "./subordinated-debt-criteria.repository";

export interface AIChatClient {
  generateMetadata(systemPrompt: string, userPrompt: string, filesData: RecordFileData[]): Promise<RecordMetadata[]>;
  detectContractLanguage(pdfBytes: Uint8Array): Promise<"Local" | "Internacional">;
  analyzeSubordinatedDebtCompliance(
    pdfBytes: Uint8Array,
    criteria: SubordinatedDebtCriterion[],
  ): Promise<SubordinatedDebtComplianceAnalysis>;
}

export type RecordMetadata = {
  recordId: string;
  metadata: Record<string, any>;
};

export interface CriterionComplianceResult {
  id: string;
  tipo: string;
  basilea: string;
  resolucion_sbs: string;
  cumplimiento: "Cumple" | "No cumple";
  contrato: string;
  justificacion: string;
}

export interface SubordinatedDebtComplianceAnalysis {
  criterios: CriterionComplianceResult[];
}
