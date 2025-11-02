export interface WarrantyInternalTable {
  // Identificadores
  id: string;
  recordId: string;
  supervisedEntityId: string;

  // Códigos principales
  codigo_cliente: string | null;
  codigo_garantia: string | null;
  codgr: string;

  // Tipo y descripción
  codigo_tipo_garantia: string | null;
  descripcion_garantia: string | null;
  direccion_garantia: string | null;

  // Moneda
  codigo_moneda: number | null;
  tipo_cambio_tasacion: number | null;

  // Fechas (todas en formato "dd/mm/yyyy")
  fecha_tasacion: string | null;
  fecha_vencimiento_tasacion: string | null;
  fecha_inicio_poliza: string | null;
  fecha_fin_poliza: string | null;
  fecha_constitucion: string | null;

  // Valores
  valor_mercado: number | null;
  valor_realizacion: number | null;
  valor_mercado_soles: number | null;
  valor_realizacion_soles: number | null;
  valor_constitucion: number | null;
  valor_constitucion_soles: number | null;

  // Póliza
  numero_poliza: string | null;

  // Inscripción
  codigo_inscripcion: string | null;

  // Tasador
  nombre_tasador: string | null;

  // Período
  period_year: number;
  period_month: number;
  period: string;
}
