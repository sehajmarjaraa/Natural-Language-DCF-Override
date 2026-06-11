import type { CompanyData } from "./companyData";
import type { BaseCase } from "./baseCase";
import { clampOverrides, type Overrides } from "./overrides";

// Deterministic 10-year unlevered-FCF DCF. Pure function of
// (company data, base case, overrides) — no randomness, no network.

export interface YearRow {
  year: number; // 1..10
  revenue: number;
  growth: number;
  grossMargin: number;
  operatingMargin: number;
  ebit: number;
  taxes: number;
  dna: number;
  capex: number;
  nwc: number;
  deltaNwc: number;
  fcf: number;
  discountFactor: number;
  pvFcf: number;
}

export interface ModelOutput {
  years: YearRow[];
  wacc: number;
  terminalGrowth: number;
  pvExplicit: number;
  terminalValue: number;
  pvTerminal: number;
  enterpriseValue: number;
  netDebt: number | null;
  equityValue: number | null;
  sharesOutstanding: number | null;
  impliedPrice: number | null;
  snapshotPrice: number | null;
  upside: number | null; // implied / snapshot - 1
}

/** Resolve a per-year value: override if present, else base; then apply the
 *  recovery path, which returns overridden metrics to base at return_year. */
function resolvePath(
  base: number[],
  overrides: Array<number | null> | undefined,
  recovery: Overrides["recovery_path"],
): number[] {
  if (!overrides) return base;
  const raw = base.map((_, i) => overrides[i] ?? null);
  if (!recovery) return raw.map((v, i) => v ?? base[i]);

  const r = recovery.return_year - 1; // index at which we are back on base
  let lastIdx = -1;
  for (let i = 0; i < r; i++) if (raw[i] != null) lastIdx = i;
  return base.map((b, i) => {
    if (i >= r) return raw[i] ?? b; // explicit overrides past return_year still respected
    if (raw[i] != null) return raw[i] as number;
    if (lastIdx < 0) return b;
    if (i < lastIdx) return b;
    if (recovery.mode === "step") return raw[lastIdx] as number;
    // linear: interpolate from the last overridden value back to base at r
    const t = (i - lastIdx) / (r - lastIdx);
    return (raw[lastIdx] as number) + t * (b - (raw[lastIdx] as number));
  });
}

export function runModel(
  company: CompanyData,
  base: BaseCase,
  rawOverrides: Overrides,
): ModelOutput {
  const o = clampOverrides(rawOverrides);
  const recovery = o.recovery_path ?? null;

  const growth = resolvePath(base.revenueGrowthPath, o.revenue_growth_overrides, recovery);
  const opMargin = resolvePath(
    Array(10).fill(base.operatingMargin.value),
    o.operating_margin_overrides,
    recovery,
  );
  const grossMargin = resolvePath(
    Array(10).fill(base.grossMargin.value),
    o.gross_margin_overrides,
    recovery,
  );
  const capexPct = resolvePath(
    Array(10).fill(base.capexPctOfRevenue.value),
    o.capex_overrides,
    recovery,
  );

  // Opex overrides shift the operating margin relative to base spending rates
  // (lower spend -> higher margin, dollar for dollar as % of revenue).
  let opexShift = 0;
  if (o.opex_overrides) {
    const { rnd, sm, ga } = o.opex_overrides;
    if (rnd != null) opexShift += base.rndPctOfRevenue.value - rnd;
    // S&M and G&A are reported combined as SG&A in most filings; treat either
    // override as replacing the combined SG&A rate.
    const sgaOverride = sm ?? ga;
    if (sgaOverride != null) opexShift += base.sgaPctOfRevenue.value - sgaOverride;
  }

  const dso = o.working_capital_overrides?.dso ?? base.dso.value;
  const dpo = o.working_capital_overrides?.dpo ?? base.dpo.value;
  const dio = o.working_capital_overrides?.dio ?? base.dio.value;

  const wacc = base.wacc.wacc + (o.wacc_override ? o.wacc_override.bps / 10_000 : 0);
  let terminalGrowth = o.terminal_growth_override ?? base.terminalGrowth.value;
  // Gordon growth requires g < WACC; keep a 1% spread.
  terminalGrowth = Math.min(terminalGrowth, wacc - 0.01);

  const taxRate = base.taxRate.value;
  const dnaPct = base.dnaPctOfRevenue.value;

  // NWC stock from working-capital days. COGS approximated through the gross
  // margin so gross-margin scenarios flow into inventory/payables.
  const nwcOf = (revenue: number, gm: number) => {
    const cogs = revenue * (1 - gm);
    return (revenue * dso) / 365 + (cogs * dio) / 365 - (cogs * dpo) / 365;
  };

  const years: YearRow[] = [];
  let revenue = base.baseRevenue;
  let prevNwc = nwcOf(revenue, base.grossMargin.value);
  let pvExplicit = 0;

  for (let i = 0; i < 10; i++) {
    revenue *= 1 + growth[i];
    const gm = grossMargin[i];
    const om = Math.min(opMargin[i] + opexShift, gm); // can't out-earn gross profit
    const ebit = revenue * om;
    const taxes = Math.max(0, ebit) * taxRate;
    const dna = revenue * dnaPct;
    const capex = revenue * capexPct[i];
    const nwc = nwcOf(revenue, gm);
    const deltaNwc = nwc - prevNwc;
    prevNwc = nwc;
    const fcf = ebit - taxes + dna - capex - deltaNwc;
    // mid-year convention: cash arrives through the year, not on Dec 31
    const discountFactor = 1 / Math.pow(1 + wacc, i + 0.5);
    const pvFcf = fcf * discountFactor;
    pvExplicit += pvFcf;
    years.push({
      year: i + 1,
      revenue,
      growth: growth[i],
      grossMargin: gm,
      operatingMargin: om,
      ebit,
      taxes,
      dna,
      capex,
      nwc,
      deltaNwc,
      fcf,
      discountFactor,
      pvFcf,
    });
  }

  // Terminal year: reinvestment normalized — at steady state, capex converges
  // to D&A (growth capex ends), so terminal FCF = NOPAT − ΔNWC. Without this,
  // a peak-investment capex rate (e.g. an AI buildout at 15-25% of revenue)
  // would be extrapolated into perpetuity and crush the terminal value.
  const y10 = years[9];
  const revenue11 = y10.revenue * (1 + terminalGrowth);
  const ebit11 = revenue11 * y10.operatingMargin;
  const nopat11 = ebit11 - Math.max(0, ebit11) * taxRate;
  const deltaNwc11 = nwcOf(revenue11, y10.grossMargin) - y10.nwc;
  const terminalFcf = nopat11 - deltaNwc11;
  const terminalValue = terminalFcf / (wacc - terminalGrowth);
  const pvTerminal = terminalValue * y10.discountFactor;
  const enterpriseValue = pvExplicit + pvTerminal;

  const netDebt = company.netDebt.netDebt.value;
  const shares = company.market.sharesOutstanding.value;
  const equityValue = netDebt != null ? enterpriseValue - netDebt : null;
  const impliedPrice = equityValue != null && shares ? equityValue / shares : null;
  const snapshotPrice = company.market.price.value;
  const upside =
    impliedPrice != null && snapshotPrice ? impliedPrice / snapshotPrice - 1 : null;

  return {
    years,
    wacc,
    terminalGrowth,
    pvExplicit,
    terminalValue,
    pvTerminal,
    enterpriseValue,
    netDebt,
    equityValue,
    sharesOutstanding: shares,
    impliedPrice,
    snapshotPrice,
    upside,
  };
}

// ----------------------------------------------------- driver attribution --

export interface WaterfallStep {
  label: string;
  delta: number; // change in enterprise value vs the previous step
  cumulative: number;
}

/** Decompose base->scenario EV by driver group, applied sequentially:
 *  revenue, then margins/opex, then capex/working capital, then WACC,
 *  then terminal growth. Order-dependent (stated in the UI). */
export function attributeDrivers(
  company: CompanyData,
  base: BaseCase,
  overrides: Overrides,
): { steps: WaterfallStep[]; baseEv: number; scenarioEv: number } {
  const groups: Array<{ label: string; patch: Partial<Overrides> }> = [
    {
      label: "Revenue",
      patch: {
        revenue_growth_overrides: overrides.revenue_growth_overrides,
        recovery_path: overrides.recovery_path,
      },
    },
    {
      label: "Margins & opex",
      patch: {
        operating_margin_overrides: overrides.operating_margin_overrides,
        gross_margin_overrides: overrides.gross_margin_overrides,
        opex_overrides: overrides.opex_overrides,
      },
    },
    {
      label: "Capex & working capital",
      patch: {
        capex_overrides: overrides.capex_overrides,
        working_capital_overrides: overrides.working_capital_overrides,
      },
    },
    { label: "WACC", patch: { wacc_override: overrides.wacc_override } },
    {
      label: "Terminal growth",
      patch: { terminal_growth_override: overrides.terminal_growth_override },
    },
  ];

  const baseEv = runModel(company, base, {}).enterpriseValue;
  let acc: Overrides = {};
  let prevEv = baseEv;
  const steps: WaterfallStep[] = [];
  for (const g of groups) {
    acc = { ...acc, ...g.patch };
    const ev = runModel(company, base, acc).enterpriseValue;
    steps.push({ label: g.label, delta: ev - prevEv, cumulative: ev });
    prevEv = ev;
  }
  return { steps, baseEv, scenarioEv: prevEv };
}
