// XBRL companyfacts parsing shared by the Node ingest script and the
// in-browser live loader. Pure functions of already-fetched JSON — no I/O.

import type { FiscalYearData, SourcedNumber } from "./companyData";

export interface XbrlFact {
  end: string;
  start?: string;
  val: number;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  frame?: string;
}

export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { units: Record<string, XbrlFact[]> }>>;
}

type Ranked = XbrlFact & { tagRank: number };

/** All USD facts across the candidate tags. Earlier tags win on conflicts
 *  (same period end), so list tags in preference order. */
function usdFacts(facts: CompanyFacts, tags: string[]): Ranked[] {
  const out: Ranked[] = [];
  tags.forEach((tag, rank) => {
    const arr = facts.facts["us-gaap"]?.[tag]?.units?.["USD"];
    if (arr) out.push(...arr.map((f) => ({ ...f, tagRank: rank })));
  });
  return out;
}

function better(a: Ranked, b: Ranked): boolean {
  // prefer higher-priority tag, then most recently filed restatement
  if (a.tagRank !== b.tagRank) return a.tagRank < b.tagRank;
  return a.filed > b.filed;
}

/** Annual (10-K, ~full-year duration) values keyed by fiscal period end date. */
export function annualByEnd(facts: CompanyFacts, tags: string[]): Map<string, XbrlFact> {
  const out = new Map<string, Ranked>();
  for (const f of usdFacts(facts, tags)) {
    if (f.form !== "10-K" || !f.start) continue;
    const days = (Date.parse(f.end) - Date.parse(f.start)) / 86_400_000;
    if (days < 340 || days > 380) continue;
    const prev = out.get(f.end);
    if (!prev || better(f, prev)) out.set(f.end, f);
  }
  return out;
}

/** Instant (balance-sheet) values keyed by date. */
export function instantByEnd(facts: CompanyFacts, tags: string[]): Map<string, XbrlFact> {
  const out = new Map<string, Ranked>();
  for (const f of usdFacts(facts, tags)) {
    if (f.form !== "10-K") continue;
    const prev = out.get(f.end);
    if (!prev || better(f, prev)) out.set(f.end, f);
  }
  return out;
}

export function sharesByEnd(facts: CompanyFacts, tags: string[]): Map<string, XbrlFact> {
  const out = new Map<string, XbrlFact>();
  for (const tag of tags) {
    const arr = facts.facts["us-gaap"]?.[tag]?.units?.["shares"];
    if (!arr) continue;
    for (const f of arr) {
      if (f.form !== "10-K" || !f.start) continue;
      const days = (Date.parse(f.end) - Date.parse(f.start)) / 86_400_000;
      if (days < 340 || days > 380) continue;
      const prev = out.get(f.end);
      if (!prev || f.filed > prev.filed) out.set(f.end, f);
    }
    if (out.size) break;
  }
  return out;
}

export interface Fundamentals {
  fiscalYears: FiscalYearData[];
  netDebt: {
    totalDebt: SourcedNumber;
    cashAndShortTermInvestments: SourcedNumber;
    netDebt: SourcedNumber;
  };
  edgarShares: SourcedNumber; // latest dei cover-page shares outstanding
}

/** Extract up to 5 fiscal years of fundamentals + latest net debt + current
 *  share count from a companyfacts payload. Missing tags become null. */
export function extractFundamentals(facts: CompanyFacts, cik: string): Fundamentals {
  const revenue = annualByEnd(facts, [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
  ]);
  const cogs = annualByEnd(facts, ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"]);
  const grossProfit = annualByEnd(facts, ["GrossProfit"]);
  const opIncome = annualByEnd(facts, ["OperatingIncomeLoss"]);
  const rnd = annualByEnd(facts, ["ResearchAndDevelopmentExpense"]);
  // Many filers (MSFT, GOOGL, AMZN, META) report S&M and G&A as separate
  // lines instead of a combined SG&A; capture both shapes and sum.
  const sgaCombined = annualByEnd(facts, ["SellingGeneralAndAdministrativeExpense"]);
  const sm = annualByEnd(facts, ["SellingAndMarketingExpense", "MarketingExpense"]);
  const ga = annualByEnd(facts, ["GeneralAndAdministrativeExpense"]);
  const dna = annualByEnd(facts, [
    "DepreciationDepletionAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
    "DepreciationAndAmortization",
    "DepreciationAmortizationAndOther",
    "DepreciationAmortizationAndImpairment",
    "Depreciation",
  ]);
  const capex = annualByEnd(facts, [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsToAcquirePropertyAndEquipmentAndIntangibleAssets",
    "PaymentsToAcquireProductiveAssets",
  ]);
  const tax = annualByEnd(facts, ["IncomeTaxExpenseBenefit"]);
  const pretax = annualByEnd(facts, [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
  ]);
  const netIncome = annualByEnd(facts, ["NetIncomeLoss"]);
  const ar = instantByEnd(facts, ["AccountsReceivableNetCurrent"]);
  const ap = instantByEnd(facts, ["AccountsPayableCurrent"]);
  const inv = instantByEnd(facts, ["InventoryNet"]);
  const dilShares = sharesByEnd(facts, [
    "WeightedAverageNumberOfDilutedSharesOutstanding",
    "WeightedAverageNumberOfSharesOutstandingBasic",
  ]);

  const ends = [...revenue.keys()].sort().slice(-5);
  if (!ends.length) throw new Error("No annual revenue facts found in SEC companyfacts for this filer.");

  const fiscalYears: FiscalYearData[] = ends.map((end) => {
    const rf = revenue.get(end)!;
    const pick = (m: Map<string, XbrlFact>) => m.get(end)?.val ?? null;
    const sgaValue =
      pick(sgaCombined) ??
      (pick(sm) != null || pick(ga) != null ? (pick(sm) ?? 0) + (pick(ga) ?? 0) : null);
    return {
      // Convention: a fiscal year is labeled by the calendar year its period
      // ends in. The XBRL `fy` field reflects the filing year of the report
      // and mislabels restated years.
      fiscalYear: parseInt(end.slice(0, 4), 10),
      periodEnd: end,
      source: `SEC EDGAR 10-K filed ${rf.filed} (CIK ${cik})`,
      revenue: rf.val,
      costOfRevenue: pick(cogs),
      grossProfit: pick(grossProfit),
      operatingIncome: pick(opIncome),
      researchAndDevelopment: pick(rnd),
      sellingGeneralAndAdmin: sgaValue,
      depreciationAndAmortization: pick(dna),
      capex: pick(capex),
      incomeTaxExpense: pick(tax),
      pretaxIncome: pick(pretax),
      netIncome: pick(netIncome),
      accountsReceivable: pick(ar),
      accountsPayable: pick(ap),
      inventory: pick(inv),
      dilutedShares: dilShares.get(end)?.val ?? null,
    };
  });

  // Net debt from the latest 10-K balance sheet.
  const latestEnd = ends[ends.length - 1];
  const pickLatest = (tags: string[], label: string): SourcedNumber => {
    const f = instantByEnd(facts, tags).get(latestEnd);
    return f
      ? { value: f.val, source: `SEC EDGAR 10-K filed ${f.filed}, ${label} at ${latestEnd}`, asOf: latestEnd }
      : { value: null, source: `not tagged in XBRL companyfacts at ${latestEnd} (${label})`, asOf: null };
  };
  const sum = (...xs: SourcedNumber[]) => {
    const present = xs.filter((x) => x.value != null);
    if (!present.length) return null;
    return present.reduce((a, x) => a + (x.value as number), 0);
  };
  const ltDebt = pickLatest(["LongTermDebtNoncurrent", "LongTermDebt"], "long-term debt");
  const stDebt = pickLatest(["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"], "current debt");
  const cash = pickLatest(["CashAndCashEquivalentsAtCarryingValue"], "cash & equivalents");
  const sti = pickLatest(
    ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"],
    "short-term investments",
  );

  const totalDebtVal = sum(ltDebt, stDebt);
  const cashStiVal = sum(cash, sti);
  const netDebt = {
    totalDebt: {
      value: totalDebtVal,
      source: `SEC EDGAR 10-K balance sheet at ${latestEnd}: long-term + current debt`,
      asOf: latestEnd,
    },
    cashAndShortTermInvestments: {
      value: cashStiVal,
      source: `SEC EDGAR 10-K balance sheet at ${latestEnd}: cash & equivalents + short-term investments`,
      asOf: latestEnd,
    },
    netDebt: {
      value: totalDebtVal != null && cashStiVal != null ? totalDebtVal - cashStiVal : null,
      source: `computed: total debt − cash & short-term investments (SEC EDGAR 10-K at ${latestEnd})`,
      asOf: latestEnd,
    },
  };

  let edgarShares: SourcedNumber = {
    value: null,
    source: "dei:EntityCommonStockSharesOutstanding not found in companyfacts",
    asOf: null,
  };
  const deiShares = facts.facts["dei"]?.["EntityCommonStockSharesOutstanding"]?.units?.["shares"];
  if (deiShares?.length) {
    const f = [...deiShares].sort((a, b) => (a.filed < b.filed ? -1 : 1))[deiShares.length - 1];
    edgarShares = {
      value: f.val,
      source: `SEC EDGAR ${f.form} filed ${f.filed}, cover-page shares outstanding as of ${f.end}`,
      asOf: f.end,
    };
  } else {
    // Multi-class filers (GOOGL, META) often lack a single dei share count;
    // fall back to the latest fiscal year's weighted-average diluted shares.
    const lastFy = fiscalYears[fiscalYears.length - 1];
    if (lastFy.dilutedShares != null) {
      edgarShares = {
        value: lastFy.dilutedShares,
        source: `SEC EDGAR 10-K FY${lastFy.fiscalYear}: weighted-average diluted shares (dei cover-page count not tagged; diluted used as proxy)`,
        asOf: lastFy.periodEnd,
      };
    }
  }

  return { fiscalYears, netDebt, edgarShares };
}
