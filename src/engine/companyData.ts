// Schema for /public/companies/{TICKER}.json — produced by scripts/ingest.ts,
// consumed by the in-browser model engine. Every figure carries a source
// string and an as-of date so the UI can render full provenance.

export interface SourcedNumber {
  value: number | null;
  source: string;
  asOf: string | null;
}

export interface SourcedText {
  value: string | null;
  source: string;
  asOf: string | null;
}

/** One fiscal year of income-statement / cash-flow / working-capital actuals.
 *  All money values are USD. `source` covers every figure in the year. */
export interface FiscalYearData {
  fiscalYear: number;
  periodEnd: string;
  source: string; // e.g. "SEC EDGAR 10-K filed 2025-02-26 (CIK 0001045810)"
  revenue: number | null;
  costOfRevenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  researchAndDevelopment: number | null;
  sellingGeneralAndAdmin: number | null;
  depreciationAndAmortization: number | null;
  capex: number | null;
  incomeTaxExpense: number | null;
  pretaxIncome: number | null;
  netIncome: number | null;
  // balance-sheet instants at periodEnd, for DSO/DPO/DIO
  accountsReceivable: number | null;
  accountsPayable: number | null;
  inventory: number | null;
  dilutedShares: number | null;
}

export interface SegmentRevenue {
  segment: string;
  revenue: number;
  fiscalYear: number;
  source: string;
}

export interface MarketSnapshot {
  provider: string; // "Financial Modeling Prep" | "Finnhub" | "Yahoo Finance (no-key fallback)"
  price: SourcedNumber;
  marketCap: SourcedNumber;
  sharesOutstanding: SourcedNumber;
  beta: SourcedNumber & { method: string };
}

export interface CompanyData {
  schemaVersion: 1;
  ticker: string;
  cik: string;
  legalName: string;
  sicCode: string | null;
  sicDescription: string | null;
  businessDescription: SourcedText;
  currency: "USD";
  fiscalYears: FiscalYearData[]; // oldest -> newest, up to 5
  segments: SegmentRevenue[] | null; // null when not tagged in XBRL companyfacts
  segmentsNote: string;
  netDebt: {
    totalDebt: SourcedNumber;
    cashAndShortTermInvestments: SourcedNumber;
    netDebt: SourcedNumber;
  };
  market: MarketSnapshot;
  riskFreeRate: SourcedNumber; // decimal, e.g. 0.0453
  generatedAt: string; // ISO timestamp of the ingest run
}
