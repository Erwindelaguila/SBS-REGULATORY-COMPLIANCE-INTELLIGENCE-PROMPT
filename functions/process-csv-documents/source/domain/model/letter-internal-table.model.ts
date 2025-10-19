export interface LetterInternalTable {
  id: string | null;
  codigo_cliente: string | null;
  codigo_credito: string | null;
  currency: "PEN" | null;
  period_month: number | null;
  period_year: number | null;
  saldo: number | null;
  saldo_mes_anterior: number | null;
  recordId: string | null;
}
