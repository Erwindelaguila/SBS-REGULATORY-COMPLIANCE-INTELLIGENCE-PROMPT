export interface SubordinatedDebtCriterion {
  id: string;
  tipo: string;
  basilea: string;
  resolucion_sbs: string;
  headers: string[];
  system_prompt?: string;
  orden?: number;
}

export interface SubordinatedDebtCriteriaRepository {
  getAllCriteria(): Promise<SubordinatedDebtCriterion[]>;
}
