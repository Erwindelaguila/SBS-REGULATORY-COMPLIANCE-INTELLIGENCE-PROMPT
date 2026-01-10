export interface SubordinatedDebtAnalysisResult {
  source: string; // recordId del PDF
  id: number; // siempre 2 (resultado final)
  type: string; // estado: "subordinated-debt.analysis.started" | "subordinated-debt.analysis.finished"
  data: {
    key: string; // ruta S3 del JSON con resultados
  };
  createdAt: string; // ISO timestamp
}

export interface SubordinatedDebtAnalysisRepository {
  saveAnalysisResult(result: SubordinatedDebtAnalysisResult): Promise<void>;
}
