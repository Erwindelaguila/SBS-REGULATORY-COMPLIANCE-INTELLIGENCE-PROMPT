export interface WarrantyRegulatoryReport {
  // Identificadores
  ID: string;
  recordId: string;
  supervisedEntityId: string;

  // Campos de garantía
  CODGR: string | null;
  CGR: number | null;
  TGR: string | null;
  CC: string | null;

  // Representante/persona
  REPEV: string | null;
  IDREPEV: string | null;

  // Póliza
  POL: string | null;
  FVEPOL: string | null;
  FINPOL: null;

  // Valores y montos
  VCONS: number | null;
  FCONS: string | null;
  FUVAL: string | null;
  VCOM: number | null;
  VREA: number | null;
  VBC: number | null;
  VANX: number | null;

  // Moneda y división por moneda
  MONGR: number | null;
  VCOM_PEN: number | null;
  VCOM_USD: number | null;
  VCOM_OTH: number | null;
  VREA_PEN: number | null;
  VREA_USD: number | null;
  VREA_OTH: number | null;

  // Bloqueo
  BLOQ: number | null;
  FBLOQ: string | null;

  // Cobertura
  COBGR: number | null;
  IGRC: number | null;

  // Liquidación
  CCLQGR: string | null;
  NCLQGR: string | null;

  // Inscripción
  CODINSCRIPCION: string | null;
  NINS: string;

  // Período
  PERIOD_YEAR: number;
  PERIOD_MONTH: number;
  period: string;
}
