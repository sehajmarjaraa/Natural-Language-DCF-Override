import type { CompanyData } from "../engine/companyData";

// Resolves a ticker to a committed company snapshot.
//
// Live in-browser EDGAR mode was investigated and rejected: data.sec.gov's
// XBRL endpoints (companyfacts/companyconcept) do not send CORS headers on
// successful responses, so browsers cannot read them, and there is no
// CORS-enabled key-free source for price/beta. Rather than route real
// financial data through a third-party CORS proxy, unknown tickers get a
// precise error telling the owner the one ingest command that adds them.

let tickerMapPromise: Promise<{ asOf: string; map: Record<string, string> }> | null = null;

function tickerMap() {
  tickerMapPromise ??= fetch(`${import.meta.env.BASE_URL}companies/tickers.json`).then((r) => {
    if (!r.ok) throw new Error("ticker map missing — run the ingest once to generate it");
    return r.json();
  });
  return tickerMapPromise;
}

export async function loadCompany(rawTicker: string): Promise<CompanyData> {
  const ticker = rawTicker.trim().toUpperCase();
  if (!/^[A-Z.-]{1,10}$/.test(ticker)) throw new Error("That doesn't look like a ticker.");

  const res = await fetch(`${import.meta.env.BASE_URL}companies/${ticker}.json`);
  if (res.ok && res.headers.get("content-type")?.includes("json")) {
    return (await res.json()) as CompanyData;
  }

  // No committed snapshot — say exactly why and what would fix it.
  const { map, asOf } = await tickerMap();
  const cik = map[ticker];
  if (!cik) {
    throw new Error(
      `"${ticker}" isn't in the SEC EDGAR ticker registry (as of ${asOf}) — only US-listed SEC filers are supported.`,
    );
  }
  throw new Error(
    `${ticker} is a real SEC filer (CIK ${cik}), but this build has no committed snapshot for it. ` +
      `SEC's XBRL API blocks browser reads (no CORS), so data can't be fetched live without a proxy. ` +
      `The site owner can add it with: npm run ingest -- --ticker ${ticker}`,
  );
}
