/**
 * scenario-engine data ingest.
 *
 *   npm run ingest -- --ticker NVDA
 *
 * Produces:
 *   public/companies/{TICKER}.json   full snapshot (schema: src/engine/companyData.ts)
 *   public/companies/index.json      list of committed tickers
 *   public/companies/tickers.json    slim ticker -> CIK map (for in-browser live mode)
 *
 * Sources, in order of preference:
 *   - Fundamentals: SEC EDGAR XBRL companyfacts (free, no key)
 *   - Profile:      SEC EDGAR submissions API + latest 10-K Item 1 (best effort)
 *   - Market data:  FMP_API_KEY -> Financial Modeling Prep
 *                   FINNHUB_API_KEY -> Finnhub
 *                   otherwise -> Yahoo Finance public chart endpoint (no key);
 *                   beta is then COMPUTED from 2 years of weekly returns vs ^GSPC
 *   - Risk-free:    U.S. Treasury daily yield curve CSV (10-year, no key)
 *
 * INTEGRITY RULE: no figure is ever invented. If a source is unreachable the
 * field is written as null with the failure recorded in its source string.
 *
 * Configure the SEC-required User-Agent via:
 *   SEC_USER_AGENT="Your Name your.email@example.com"
 */

import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CompanyData, SourcedNumber, SourcedText } from "../src/engine/companyData.ts";
import { extractFundamentals, type CompanyFacts } from "../src/engine/ingestCore.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SEC_UA =
  process.env.SEC_USER_AGENT ??
  "scenario-engine-ingest (set SEC_USER_AGENT='Name email@example.com') contact@example.com";

// ~10 req/sec max against SEC; we stay far under it.
let lastSecRequest = 0;
async function secThrottle() {
  const wait = 150 - (Date.now() - lastSecRequest);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSecRequest = Date.now();
}
async function secFetch(url: string): Promise<unknown> {
  await secThrottle();
  const res = await fetch(url, { headers: { "User-Agent": SEC_UA } });
  if (!res.ok) throw new Error(`SEC ${res.status} for ${url}`);
  return res.json();
}
async function secFetchText(url: string): Promise<string> {
  await secThrottle();
  const res = await fetch(url, { headers: { "User-Agent": SEC_UA } });
  if (!res.ok) throw new Error(`SEC ${res.status} for ${url}`);
  return res.text();
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) scenario-engine-ingest";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// -------------------------------------------------------- market data ------

interface MarketResult {
  provider: string;
  price: SourcedNumber;
  marketCap: SourcedNumber;
  sharesOutstanding: SourcedNumber;
  beta: SourcedNumber & { method: string };
}

function nullMarket(reason: string): MarketResult {
  const src = `unavailable at ingest: ${reason}`;
  return {
    provider: "none",
    price: { value: null, source: src, asOf: null },
    marketCap: { value: null, source: src, asOf: null },
    sharesOutstanding: { value: null, source: src, asOf: null },
    beta: { value: null, source: src, asOf: null, method: "n/a" },
  };
}

async function fetchFmp(ticker: string, key: string): Promise<MarketResult> {
  const res = await fetch(
    `https://financialmodelingprep.com/api/v3/profile/${ticker}?apikey=${key}`,
  );
  if (!res.ok) throw new Error(`FMP ${res.status}`);
  const [p] = (await res.json()) as Array<{
    price: number;
    mktCap: number;
    beta: number;
    sharesOutstanding?: number;
  }>;
  if (!p) throw new Error("FMP returned empty profile");
  const asOf = today();
  const src = `Financial Modeling Prep /v3/profile as of ${asOf}`;
  return {
    provider: "Financial Modeling Prep",
    price: { value: p.price ?? null, source: src, asOf },
    marketCap: { value: p.mktCap ?? null, source: src, asOf },
    sharesOutstanding: {
      value: p.sharesOutstanding ?? (p.mktCap && p.price ? p.mktCap / p.price : null),
      source: src,
      asOf,
    },
    beta: { value: p.beta ?? null, source: src, asOf, method: "provider-reported beta" },
  };
}

async function fetchFinnhub(ticker: string, key: string): Promise<MarketResult> {
  const [quoteRes, metricRes] = await Promise.all([
    fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${key}`),
    fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${key}`),
  ]);
  if (!quoteRes.ok || !metricRes.ok) throw new Error("Finnhub request failed");
  const quote = (await quoteRes.json()) as { c: number };
  const metric = (await metricRes.json()) as {
    metric?: { beta?: number; marketCapitalization?: number };
  };
  const asOf = today();
  const src = `Finnhub /quote and /stock/metric as of ${asOf}`;
  const mcap = metric.metric?.marketCapitalization
    ? metric.metric.marketCapitalization * 1e6
    : null;
  return {
    provider: "Finnhub",
    price: { value: quote.c ?? null, source: src, asOf },
    marketCap: { value: mcap, source: src, asOf },
    sharesOutstanding: {
      value: mcap && quote.c ? mcap / quote.c : null,
      source: src,
      asOf,
    },
    beta: {
      value: metric.metric?.beta ?? null,
      source: src,
      asOf,
      method: "provider-reported beta",
    },
  };
}

interface YahooChart {
  chart: {
    result: Array<{
      meta: { regularMarketPrice: number; regularMarketTime: number };
      timestamp: number[];
      indicators: { adjclose?: Array<{ adjclose: Array<number | null> }> };
    }>;
    error: unknown;
  };
}

async function yahooChart(symbol: string, range: string, interval: string): Promise<YahooChart> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=${range}&interval=${interval}&events=div%2Csplit`;
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!res.ok) throw new Error(`Yahoo ${res.status} for ${symbol}`);
  return (await res.json()) as YahooChart;
}

function weeklyReturns(closes: Array<number | null>): number[] {
  const clean = closes.filter((c): c is number => c != null && c > 0);
  const out: number[] = [];
  for (let i = 1; i < clean.length; i++) out.push(clean[i] / clean[i - 1] - 1);
  return out;
}

/** No-key fallback: price from Yahoo; beta computed from 2y weekly returns
 *  vs ^GSPC (covariance / variance) — real data, documented method. */
async function fetchYahoo(
  ticker: string,
  edgarShares: SourcedNumber,
): Promise<MarketResult> {
  const [stock, spx] = await Promise.all([
    yahooChart(ticker, "2y", "1wk"),
    yahooChart("^GSPC", "2y", "1wk"),
  ]);
  const sMeta = stock.chart.result[0].meta;
  const price = sMeta.regularMarketPrice;
  const asOf = new Date(sMeta.regularMarketTime * 1000).toISOString().slice(0, 10);
  const priceSrc = `Yahoo Finance public chart API, regular market price as of ${asOf}`;

  const sr = weeklyReturns(stock.chart.result[0].indicators.adjclose?.[0]?.adjclose ?? []);
  const mr = weeklyReturns(spx.chart.result[0].indicators.adjclose?.[0]?.adjclose ?? []);
  const n = Math.min(sr.length, mr.length);
  let beta: number | null = null;
  if (n >= 52) {
    const s = sr.slice(-n);
    const m = mr.slice(-n);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const ms = mean(s);
    const mm = mean(m);
    let cov = 0;
    let varM = 0;
    for (let i = 0; i < n; i++) {
      cov += (s[i] - ms) * (m[i] - mm);
      varM += (m[i] - mm) ** 2;
    }
    beta = varM > 0 ? cov / varM : null;
  }

  const shares = edgarShares.value;
  return {
    provider: "Yahoo Finance (no-key fallback)",
    price: { value: price, source: priceSrc, asOf },
    marketCap: {
      value: shares ? price * shares : null,
      source: shares
        ? `computed: Yahoo price as of ${asOf} x shares outstanding (${edgarShares.source})`
        : "unavailable: no share count to compute market cap",
      asOf,
    },
    sharesOutstanding: edgarShares,
    beta: {
      value: beta != null ? Math.round(beta * 100) / 100 : null,
      source: `computed from ${n} weekly adjusted-close returns of ${ticker} vs S&P 500 (^GSPC), Yahoo Finance, as of ${asOf}`,
      asOf,
      method: "2-year weekly regression beta (cov/var vs ^GSPC)",
    },
  };
}

// ---------------------------------------------------------- risk-free ------

async function fetchRiskFree(): Promise<SourcedNumber> {
  const year = new Date().getFullYear();
  const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${year}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${year}&page&_format=csv`;
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (!res.ok) throw new Error(`Treasury ${res.status}`);
  const lines = (await res.text()).trim().split("\n");
  const header = lines[0].split(",").map((h) => h.replaceAll('"', "").trim());
  const tenIdx = header.findIndex((h) => h === "10 Yr");
  if (tenIdx < 0 || lines.length < 2) throw new Error("Treasury CSV missing 10 Yr column");
  const latest = lines[1].split(",");
  const [m, d, y] = latest[0].split("/");
  const asOf = `${y}-${m}-${d}`;
  const pct = parseFloat(latest[tenIdx]);
  return {
    value: pct / 100,
    source: `U.S. Department of the Treasury, daily par yield curve, 10-year, as of ${asOf}`,
    asOf,
  };
}

// ------------------------------------------------- profile / description ---

async function fetchDescription(cik: string): Promise<SourcedText> {
  try {
    const subs = (await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`)) as {
      filings: {
        recent: {
          form: string[];
          accessionNumber: string[];
          primaryDocument: string[];
          filingDate: string[];
        };
      };
    };
    const r = subs.filings.recent;
    const i = r.form.findIndex((f) => f === "10-K");
    if (i < 0) throw new Error("no 10-K in recent filings");
    const accession = r.accessionNumber[i].replaceAll("-", "");
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accession}/${r.primaryDocument[i]}`;
    const html = await secFetchText(docUrl);
    const text = html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ");
    // Find the real "Item 1. Business" heading (not the table-of-contents
    // entry, which is immediately followed by more "Item ..." lines).
    const re = /Item\s*1\s*\.?\s*Business/gi;
    let snippet: string | null = null;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 2400);
      if (/^\s*\d*\s*Item\s*1A/i.test(after)) continue; // TOC entry
      const body = after.split(/Item\s*1A/i)[0].trim();
      if (body.length < 200) continue;
      snippet = body.slice(0, 700).replace(/\s+\S*$/, "") + "…";
      break;
    }
    if (!snippet) throw new Error("Item 1 pattern not found");
    return {
      value: snippet,
      source: `SEC EDGAR 10-K filed ${r.filingDate[i]}, Item 1 (Business), extracted excerpt`,
      asOf: r.filingDate[i],
    };
  } catch (e) {
    return {
      value: null,
      source: `unavailable at ingest: ${(e as Error).message}`,
      asOf: null,
    };
  }
}

// -------------------------------------------------------------- main -------

async function main() {
  const tickerArg = process.argv.indexOf("--ticker");
  const ticker = (tickerArg >= 0 ? process.argv[tickerArg + 1] : "NVDA").toUpperCase();
  console.log(`Ingesting ${ticker} ...`);

  const tickerMap = (await secFetch("https://www.sec.gov/files/company_tickers.json")) as Record<
    string,
    { cik_str: number; ticker: string; title: string }
  >;
  const hit = Object.values(tickerMap).find((e) => e.ticker === ticker);
  if (!hit) throw new Error(`Ticker ${ticker} not found in SEC company_tickers.json`);
  const cik = String(hit.cik_str).padStart(10, "0");
  console.log(`  CIK ${cik} (${hit.title})`);

  const dir = join(ROOT, "public", "companies");
  mkdirSync(dir, { recursive: true });

  // Slim ticker -> CIK map so the deployed site can resolve any ticker for
  // live in-browser EDGAR mode (company_tickers.json itself is not CORS-enabled).
  const slim: Record<string, string> = {};
  for (const e of Object.values(tickerMap)) {
    if (!(e.ticker in slim)) slim[e.ticker] = String(e.cik_str).padStart(10, "0");
  }
  writeFileSync(
    join(dir, "tickers.json"),
    JSON.stringify({
      source: "SEC EDGAR company_tickers.json",
      asOf: today(),
      map: slim,
    }),
  );
  console.log(`  wrote tickers.json (${Object.keys(slim).length} tickers)`);

  const facts = (await secFetch(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
  )) as CompanyFacts;

  const { fiscalYears, netDebt, edgarShares } = extractFundamentals(facts, cik);
  console.log(
    `  ${fiscalYears.length} fiscal years: FY${fiscalYears[0].fiscalYear}–FY${fiscalYears[fiscalYears.length - 1].fiscalYear}`,
  );

  // Profile
  let sicCode: string | null = null;
  let sicDescription: string | null = null;
  try {
    const subs = (await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`)) as {
      sic: string;
      sicDescription: string;
    };
    sicCode = subs.sic ?? null;
    sicDescription = subs.sicDescription ?? null;
  } catch {
    /* leave null */
  }
  const businessDescription = await fetchDescription(cik);
  console.log(`  description: ${businessDescription.value ? "extracted" : "unavailable"}`);

  // Market snapshot (provider chain).
  let market: MarketResult;
  try {
    if (process.env.FMP_API_KEY) market = await fetchFmp(ticker, process.env.FMP_API_KEY);
    else if (process.env.FINNHUB_API_KEY)
      market = await fetchFinnhub(ticker, process.env.FINNHUB_API_KEY);
    else market = await fetchYahoo(ticker, edgarShares);
    console.log(
      `  market: ${market.provider} — price ${market.price.value}, beta ${market.beta.value}`,
    );
  } catch (e) {
    console.warn(`  market data unavailable: ${(e as Error).message}`);
    market = nullMarket((e as Error).message);
  }

  // Risk-free rate.
  let riskFreeRate: SourcedNumber;
  try {
    riskFreeRate = await fetchRiskFree();
    console.log(`  risk-free 10Y: ${(riskFreeRate.value! * 100).toFixed(2)}% (${riskFreeRate.asOf})`);
  } catch (e) {
    riskFreeRate = {
      value: null,
      source: `unavailable at ingest: ${(e as Error).message}`,
      asOf: null,
    };
  }

  const out: CompanyData = {
    schemaVersion: 1,
    ticker,
    cik,
    legalName: facts.entityName || hit.title,
    sicCode,
    sicDescription,
    businessDescription,
    currency: "USD",
    fiscalYears,
    segments: null,
    segmentsNote:
      "Segment revenue is reported with XBRL dimensions, which the SEC companyfacts API does not expose; left null rather than approximated. See the 10-K segment footnote for reported segments.",
    netDebt,
    market,
    riskFreeRate,
    generatedAt: new Date().toISOString(),
  };

  const file = join(dir, `${ticker}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`Wrote ${file}`);

  // Refresh the committed-ticker index.
  const committed = readdirSync(dir)
    .filter((f) => /^[A-Z.]+\.json$/.test(f) && f !== "index.json" && f !== "tickers.json")
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
  writeFileSync(join(dir, "index.json"), JSON.stringify({ tickers: committed }, null, 2));
  console.log(`Committed snapshots: ${committed.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
