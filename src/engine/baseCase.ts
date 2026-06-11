import type { CompanyData } from "./companyData";

// Base-case forward assumptions, each derived from the real historicals in
// CompanyData and carrying a human-readable derivation string for the UI.

export interface DerivedValue {
  value: number;
  derivation: string;
}

export interface WaccBuild {
  riskFree: number;
  rawBeta: number;
  beta: number; // Blume-adjusted: 2/3 raw + 1/3 market
  equityRiskPremium: number; // labeled long-run assumption
  costOfEquity: number;
  wacc: number; // == costOfEquity here; see derivation
  derivation: string;
}

export interface BaseCase {
  // 10-year revenue growth path: year-1 growth from trailing CAGR (capped),
  // fading linearly to terminal growth by year 10.
  revenueGrowthPath: number[];
  growthDerivation: string;
  trailingCagr3y: number | null;
  growthCap: number;
  grossMargin: DerivedValue;
  operatingMargin: DerivedValue;
  rndPctOfRevenue: DerivedValue;
  sgaPctOfRevenue: DerivedValue;
  dnaPctOfRevenue: DerivedValue;
  capexPctOfRevenue: DerivedValue;
  dso: DerivedValue;
  dpo: DerivedValue;
  dio: DerivedValue;
  taxRate: DerivedValue;
  terminalGrowth: DerivedValue;
  wacc: WaccBuild;
  baseRevenue: number; // latest actual FY revenue
  baseYearLabel: string;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

// Modeling assumptions, labeled as such everywhere they appear:
export const TERMINAL_GROWTH_DEFAULT = 0.025;
export const EQUITY_RISK_PREMIUM = 0.045;
export const YEAR1_GROWTH_CAP = 0.35;
export const BETA_FALLBACK = 1.0;
export const RISK_FREE_FALLBACK = 0.045;

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function lastN<T>(xs: T[], n: number): T[] {
  return xs.slice(-n);
}

export function deriveBaseCase(c: CompanyData): BaseCase {
  const fys = c.fiscalYears.filter((f) => f.revenue != null);
  if (fys.length < 2) throw new Error("Need at least 2 fiscal years of revenue");
  const latest = fys[fys.length - 1];
  const yearsLabel = (n: number) =>
    `FY${fys[fys.length - n].fiscalYear}–FY${latest.fiscalYear}`;

  // --- revenue growth: trailing 3y CAGR (or longest available), capped ---
  const span = Math.min(3, fys.length - 1);
  const first = fys[fys.length - 1 - span];
  const cagr = Math.pow(latest.revenue! / first.revenue!, 1 / span) - 1;
  const year1 = Math.min(cagr, YEAR1_GROWTH_CAP);
  const terminal = TERMINAL_GROWTH_DEFAULT;
  const revenueGrowthPath = Array.from({ length: 10 }, (_, i) =>
    year1 + ((terminal - year1) * i) / 9,
  );
  const growthDerivation =
    `Trailing ${span}-year revenue CAGR ${pct(cagr)} (FY${first.fiscalYear}→FY${latest.fiscalYear}, SEC EDGAR)` +
    (cagr > YEAR1_GROWTH_CAP
      ? `, capped at ${pct(YEAR1_GROWTH_CAP)} for year 1 (modeling assumption)`
      : `, used as year-1 growth`) +
    `, fading linearly to the ${pct(terminal)} terminal growth assumption by year 10.`;

  // --- margins & expense ratios: trailing 3-year averages of actuals ---
  const m3 = lastN(fys, 3);
  const ratio = (
    num: (f: (typeof fys)[number]) => number | null,
    name: string,
  ): DerivedValue | null => {
    const pts = m3.filter((f) => num(f) != null && f.revenue);
    if (!pts.length) return null;
    const v = avg(pts.map((f) => num(f)! / f.revenue!));
    return {
      value: v,
      derivation: `${name}: trailing ${pts.length}-year average of ${yearsLabel(pts.length)} actuals (SEC EDGAR) = ${pct(v)} of revenue.`,
    };
  };

  const grossMargin =
    ratio((f) => f.grossProfit ?? (f.costOfRevenue != null ? f.revenue! - f.costOfRevenue : null), "Gross margin") ??
    { value: 0.5, derivation: "Gross margin: not tagged in filings; 50% placeholder (flagged)." };
  const operatingMargin =
    ratio((f) => f.operatingIncome, "Operating margin") ??
    { value: 0.2, derivation: "Operating margin: not tagged in filings; 20% placeholder (flagged)." };
  const rndPct =
    ratio((f) => f.researchAndDevelopment, "R&D") ??
    { value: 0, derivation: "R&D: not separately tagged in filings." };
  const sgaPct =
    ratio((f) => f.sellingGeneralAndAdmin, "SG&A") ??
    { value: 0, derivation: "SG&A: not separately tagged in filings." };
  const dnaPct =
    ratio((f) => f.depreciationAndAmortization, "D&A") ??
    { value: 0.03, derivation: "D&A: not tagged; 3% of revenue placeholder (flagged)." };
  const capexPct =
    ratio((f) => f.capex, "Capex") ??
    { value: 0.04, derivation: "Capex: not tagged; 4% of revenue placeholder (flagged)." };

  // --- working-capital days from the latest balance sheet ---
  const days = (
    bal: number | null,
    flow: number | null,
    name: string,
    flowName: string,
  ): DerivedValue => {
    if (bal == null || !flow) {
      return { value: 0, derivation: `${name}: not tagged in latest 10-K; held at 0 (excluded from NWC).` };
    }
    const v = (bal / flow) * 365;
    return {
      value: v,
      derivation: `${name} = 365 x (balance at FY${latest.fiscalYear} end / FY${latest.fiscalYear} ${flowName}) = ${v.toFixed(0)} days (SEC EDGAR).`,
    };
  };
  const dso = days(latest.accountsReceivable, latest.revenue, "DSO", "revenue");
  const dpo = days(latest.accountsPayable, latest.costOfRevenue, "DPO", "cost of revenue");
  const dio = days(latest.inventory, latest.costOfRevenue, "DIO", "cost of revenue");

  // --- effective tax rate: trailing 3y, clamped to a sane band ---
  const taxPts = m3.filter((f) => f.incomeTaxExpense != null && f.pretaxIncome);
  const rawTax = taxPts.length
    ? avg(taxPts.map((f) => f.incomeTaxExpense! / f.pretaxIncome!))
    : 0.21;
  const taxRate = {
    value: Math.min(0.35, Math.max(0.05, rawTax)),
    derivation: taxPts.length
      ? `Effective tax rate: trailing ${taxPts.length}-year average of tax expense / pre-tax income (SEC EDGAR) = ${pct(rawTax)}${rawTax !== Math.min(0.35, Math.max(0.05, rawTax)) ? ", clamped to 5–35%" : ""}.`
      : "Effective tax rate: filings not tagged; 21% U.S. statutory rate assumption.",
  };

  // --- WACC from real risk-free + real beta + labeled ERP ---
  // Raw regression betas mean-revert; the standard Blume adjustment
  // (2/3 raw + 1/3 market) is applied and labeled.
  const rf = c.riskFreeRate.value ?? RISK_FREE_FALLBACK;
  const rawBeta = c.market.beta.value ?? BETA_FALLBACK;
  const beta = c.market.beta.value != null ? (2 / 3) * rawBeta + 1 / 3 : BETA_FALLBACK;
  const costOfEquity = rf + beta * EQUITY_RISK_PREMIUM;
  const wacc: WaccBuild = {
    riskFree: rf,
    rawBeta,
    beta,
    equityRiskPremium: EQUITY_RISK_PREMIUM,
    costOfEquity,
    wacc: costOfEquity,
    derivation:
      `WACC = cost of equity = risk-free ${pct(rf)} (${c.riskFreeRate.value != null ? c.riskFreeRate.source : "source unavailable; 4.5% fallback, flagged"}) ` +
      `+ beta ${beta.toFixed(2)} (raw ${rawBeta.toFixed(2)} ${c.market.beta.value != null ? `from ${c.market.beta.source}, Blume-adjusted: 2/3 raw + 1/3 market` : "— unavailable; 1.0 fallback, flagged"}) x ${pct(EQUITY_RISK_PREMIUM)} equity risk premium (labeled long-run assumption) ` +
      `= ${pct(costOfEquity)}. Debt is immaterial vs market cap, so the equity-only rate is used.`,
  };

  return {
    revenueGrowthPath,
    growthDerivation,
    trailingCagr3y: cagr,
    growthCap: YEAR1_GROWTH_CAP,
    grossMargin,
    operatingMargin,
    rndPctOfRevenue: rndPct,
    sgaPctOfRevenue: sgaPct,
    dnaPctOfRevenue: dnaPct,
    capexPctOfRevenue: capexPct,
    dso,
    dpo,
    dio,
    taxRate,
    terminalGrowth: {
      value: terminal,
      derivation: `Terminal growth ${pct(terminal)}: labeled long-run assumption, roughly long-run nominal GDP minus inflation drag; not derived from company data.`,
    },
    wacc,
    baseRevenue: latest.revenue!,
    baseYearLabel: `FY${latest.fiscalYear}`,
  };
}
