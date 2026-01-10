export interface SubordinatedDebtCriterion {
  id: string;
  tipo: string;
  basilea: string;
  resolucion_sbs: string;
  headers: string[];
}

export interface SubordinatedDebtCriteriaRepository {
  getAllCriteria(): Promise<SubordinatedDebtCriterion[]>;
}
