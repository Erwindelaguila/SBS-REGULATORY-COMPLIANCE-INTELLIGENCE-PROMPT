export interface WarrantyRegulatoryReport {
  // pk
  ID: string;

  // from file
  CODGR: string | null;
  TGR: string | null;
  CGR: number | null;
  FCONS: string | null;
  FUVAL: string | null;
  REPEV: string | null;
  POL: string | null;
  FVEPOL: string | null;
  MONGR: number | null;
  VCONS: number | null;
  VCOM: number | null;
  VREA: number | null;
  CC: string | null;
  VBC: number | null;
  VANX: number | null;
  CCLQGR: string | null;
  NCLQGR: string | null;
  BLOQ: number | null;
  FBLOQ: string | null;
  IDREPEV: string | null;
  COBGR: number | null;
  IGRC: number | null;
  CODINSCRIPCION: string | null;

  // currency values
  VCOM_OTH: number | null;
  VCOM_PEN: number | null;
  VCOM_USD: number | null;
  VREA_OTH: number | null;
  VREA_PEN: number | null;
  VREA_USD: number | null;

  // default ?
  FINPOL: null;

  // from supervisory record
  period: string;
  PERIOD_MONTH: number;
  PERIOD_YEAR: number;
  recordId: string;
  supervisedEntityId: string;
}
