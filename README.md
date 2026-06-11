# scenario-engine

Say what happens to the economy. Watch what happens to the valuation.

A static personal-project site that loads a real company's SEC-filed financials, derives a
base-case 10-year DCF from those historicals, and revalues it live as you perturb the
assumptions — with canned presets, sliders, or a sentence of plain English. The math is a pure,
deterministic TypeScript function running in the browser. The only thing an LLM ever does is
translate language into a schema-validated override object.

```
npm install && npm run dev
```

No API key, no backend, no network calls at runtime. The natural-language mode is the one
optional feature that needs a key — the **visitor's own** Anthropic key, held in React state
only and sent nowhere except `api.anthropic.com`.

## How it fits together

```
scripts/ingest.ts            owner-run, build time      → public/companies/NVDA.json (committed)
src/engine/baseCase.ts       derive assumptions from real historicals, with derivation strings
src/engine/dcf.ts            pure 10y unlevered-FCF DCF + driver-attribution waterfall
src/engine/overrides.ts      zod schema + clamps — the ONE override object all 3 input modes emit
src/data/presets.ts          5 committed scenarios (zero API calls)
src/lib/anthropic.ts         plain English → overrides (visitor key, 1 call, 1 retry, clamped)
src/components/*             the site
```

## Data ingest (real, traceable, dated)

```
SEC_USER_AGENT="Your Name you@example.com" npm run ingest -- --ticker NVDA
```

| Field | Source | Notes |
|---|---|---|
| 5y revenue, margins, R&D/SG&A, D&A, capex, tax, AR/AP/inventory, diluted shares | SEC EDGAR XBRL `companyfacts` | 10-K, full-year durations only; latest filing wins on restatements; each year stamped `"SEC EDGAR 10-K filed YYYY-MM-DD"` |
| Legal name, SIC, CIK | EDGAR `company_tickers.json` + submissions API | |
| Business description | Latest 10-K Item 1, HTML-stripped excerpt | best effort; `null` if the filing's shape defeats the extractor |
| Net debt | Latest 10-K balance sheet: (LT + current debt) − (cash + ST investments) | computed, formula stated in the source string |
| Price, market cap, beta | `FMP_API_KEY` → Financial Modeling Prep; else `FINNHUB_API_KEY` → Finnhub; else Yahoo Finance public chart endpoint (no key) | each value stamped with provider and fetch date |
| Beta (no-key fallback) | **Computed**: 2 years of weekly adjusted-close returns vs ^GSPC, cov/var | real data, method stated on the provenance panel |
| Risk-free rate | U.S. Treasury daily par yield curve CSV, 10-year | no key, stamped with date |

SEC requests carry the `SEC_USER_AGENT` header and are throttled well under 10 req/sec.

**Integrity rule:** the ingest never invents a number. An unreachable source writes `null` with
the failure recorded in the field's `source` string, and the UI renders `null` — not an
estimate. Segment revenue is dimensional XBRL that `companyfacts` does not expose, so it is
committed as `null` with a note rather than approximated.

## Base case (derived, shown)

Every assumption carries a derivation string rendered in the "Base-case assumptions" panel:

- **Revenue growth**: trailing 3-year CAGR from the filed revenue, used as year-1 growth,
  fading linearly to terminal growth by year 10.
- **Margins, R&D/SG&A, D&A, capex**: trailing 3-year averages of filed actuals, as % of revenue.
- **DSO / DPO / DIO**: 365 × (latest balance / latest year's revenue or COGS).
- **Tax rate**: trailing 3-year effective rate, clamped to 5–35%.
- **WACC**: real 10Y Treasury + real beta × equity risk premium. Debt is immaterial vs market
  cap for the shipped company, so WACC = cost of equity (stated in the derivation).

## Recorded modeling assumptions (not data)

These are labeled as assumptions everywhere they appear:

1. **Year-1 growth cap 35%** (`YEAR1_GROWTH_CAP`). NVDA's trailing 3y CAGR is ~100%; carrying
   that into a 10-year DCF is meaningless, so year-1 growth is `min(CAGR, 35%)` with the cap
   stated in the derivation string.
2. **Equity risk premium 4.5%** (`EQUITY_RISK_PREMIUM`) — labeled long-run assumption.
3. **Terminal growth 2.5%** default, clamped to ≤ WACC − 1% so Gordon growth stays defined.
   **Terminal reinvestment is normalized**: in the terminal year capex = D&A, so terminal
   FCF = NOPAT − ΔNWC. Without this, a peak investment cycle (AI buildouts running at 15–25%
   of revenue at MSFT/GOOGL/AMZN/META) would be extrapolated into perpetuity and mechanically
   zero out the terminal value.
4. **Beta is Blume-adjusted** (2/3 raw + 1/3 market), the standard mean-reversion adjustment;
   both raw and adjusted values are shown in the WACC derivation.
5. **Mid-year discounting convention** — cash flows arrive through the year, not on Dec 31;
   the terminal value is discounted at the year-10 mid-year factor (banker's convention).
6. **SG&A**: filers reporting S&M and G&A separately (MSFT, GOOGL, AMZN, META) are summed into
   one SG&A line; combined-SG&A filers use the combined tag.
7. **Share count**: provider count, else dei cover-page count, else (for multi-class filers
   like GOOGL/META where dei is untagged) latest weighted-average diluted shares, labeled as a
   proxy.
8. **Fiscal-year labeling**: a fiscal year is labeled by the calendar year its period ends in
   (the XBRL `fy` field reflects the filing year and mislabels restated prior years).
9. **Working capital**: NWC stock from DSO/DPO/DIO days; COGS approximated through gross margin
   so gross-margin scenarios flow into inventory and payables.
10. **Opex overrides** shift operating margin dollar-for-dollar vs the base spending rates; S&M
   and G&A map to the (possibly summed) SG&A line.
11. **Pre-split share counts**: older fiscal years carry as-filed (pre-split) diluted shares;
   per-share outputs use only the current share count.
12. **Waterfall attribution is sequential** (revenue → margins/opex → capex/WC → WACC →
   terminal), so driver interaction effects land in later steps — stated under the chart.
13. **LLM call**: `claude-opus-4-8` with structured JSON output. The spec's "temperature 0"
   intent is met by schema-constrained output — current Claude models removed the temperature
   parameter (sending it errors); determinism of everything on screen comes from the engine,
   not the LLM, which can only emit override assumptions.

## Switching companies

The Plain English tab has a **Company** field: enter any committed ticker and the whole tool —
presets, sliders, scenarios, provenance — re-derives for that company. This build ships
snapshots for **NVDA, AAPL, MSFT, GOOGL, AMZN, META, TSLA** (`public/companies/index.json`),
each ingested with full provenance. Add more with one command:

```
npm run ingest -- --ticker ADBE   # then rebuild/redeploy
```

For a ticker without a committed snapshot, the UI resolves it against a committed, dated copy
of the SEC ticker registry and explains exactly what's missing. **Why no live in-browser
fetch:** SEC's XBRL API (`data.sec.gov/api/xbrl/*`) does not send CORS headers on successful
responses, so browsers cannot read it, and no CORS-enabled key-free source exists for price and
beta. Routing real financial data through a third-party CORS proxy would compromise both the
integrity rule and the no-third-parties privacy posture, so unknown tickers fail loudly and
honestly instead.

## Three ways to drive the model

1. **Presets** — 5 committed override JSONs; clicking revalues instantly, zero API calls.
2. **Sliders** — map to the same override object, so the engine path is identical to the AI path.
3. **Plain English** — ticker field + textarea + password field for the visitor's Anthropic key. One call,
   structured-output JSON, zod-validated with one retry, then clamped to the same bounds as
   every other input. The key lives in component state only — never localStorage, never any
   server. The model returns assumptions (growth/margin/WACC overrides, a macro thesis, a CFO
   pushback, confidence scores, consistency flags) and **cannot** emit a price or valuation.

## Tests

`npm test` — engine determinism, override clamping, Gordon-growth guard, linear/step recovery
paths, waterfall reconciliation.

## Deploy (all free)

The build is fully static with relative asset paths (`base: "./"`), so the same `dist/` works on:

- **Vercel** / **Cloudflare Pages**: framework = Vite, build `npm run build`, output `dist`.
- **GitHub Pages**: `npm run build`, publish `dist/` (e.g. `actions/deploy-pages`). Relative
  base means project pages work without configuration.
- **Hugging Face Spaces (static)**: upload `dist/` as the Space contents.

Note for the Anthropic call: it is made directly from the visitor's browser with
`dangerouslyAllowBrowser`, which is appropriate here precisely because the key is the
visitor's own and never touches a server you operate.

## Changing the default company

`npm run ingest -- --ticker X`, then change `TICKER` in `src/App.tsx` (the ticker shown on
first load — visitors can switch among all committed tickers from the UI). The preset override
values were written with NVDA in mind but are generic scenario shapes; switching companies
resets the tool to that company's derived base case.

## Disclaimer

Research and educational demonstration using public SEC filings and market data as of the dates
stated in the committed snapshot. Not investment advice; not a recommendation on any security.
