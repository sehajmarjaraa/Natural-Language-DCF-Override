import type { CompanyData } from "../engine/companyData";
import type { SourcedNumber } from "../engine/companyData";
import { money, price, pct } from "../lib/format";

interface Props {
  company: CompanyData;
}

function Row({
  label,
  value,
  source,
  asOf,
}: {
  label: string;
  value: string;
  source: string;
  asOf?: string | null;
}) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-0.5 border-b border-edge py-2.5 last:border-0 sm:grid-cols-[10rem_7rem_1fr]">
      <div className="text-[12px] text-ink-dim">{label}</div>
      <div className="num text-[12px] text-ink">{value}</div>
      <div className="col-span-2 text-[11px] leading-snug text-ink-faint sm:col-span-1">
        {source}
        {asOf ? ` · as of ${asOf}` : ""}
      </div>
    </div>
  );
}

const fmtSourced = (s: SourcedNumber, f: (v: number) => string) =>
  s.value != null ? f(s.value) : "null";

export function Provenance({ company }: Props) {
  const latest = company.fiscalYears[company.fiscalYears.length - 1];
  return (
    <section id="data" className="mx-auto max-w-5xl scroll-mt-16 px-5 py-20">
      <h2 className="text-[10px] uppercase tracking-[0.2em] text-ink-faint">
        Real data &amp; provenance
      </h2>
      <p className="mt-2 max-w-2xl text-xl font-medium tracking-tight text-ink">
        Every figure on this page traces to a public source with an as-of date.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0">
          <h3 className="text-[12px] font-medium text-ink">
            {company.legalName}{" "}
            <span className="num text-ink-faint">
              · {company.ticker} · CIK {company.cik}
            </span>
          </h3>
          {company.sicDescription && (
            <p className="mt-1 text-[12px] text-ink-dim">
              SIC {company.sicCode} — {company.sicDescription}{" "}
              <span className="text-ink-faint">(SEC EDGAR submissions API)</span>
            </p>
          )}
          {company.businessDescription.value ? (
            <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
              "{company.businessDescription.value}"
            </p>
          ) : (
            <p className="mt-3 text-[13px] text-ink-faint">
              Business description unavailable at ingest ({company.businessDescription.source}).
            </p>
          )}
          <p className="mt-1.5 text-[11px] text-ink-faint">{company.businessDescription.source}</p>

          <h4 className="mt-8 text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            Reported fiscal years
          </h4>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left">
              <thead>
                <tr className="border-b border-edge text-[10px] uppercase tracking-wider text-ink-faint">
                  <th className="py-2 pr-3 font-normal">FY</th>
                  <th className="py-2 pr-3 font-normal">Revenue</th>
                  <th className="py-2 pr-3 font-normal">Op income</th>
                  <th className="py-2 pr-3 font-normal">R&amp;D</th>
                  <th className="py-2 pr-3 font-normal">Capex</th>
                  <th className="py-2 font-normal">Source</th>
                </tr>
              </thead>
              <tbody>
                {company.fiscalYears.map((fy) => (
                  <tr key={fy.fiscalYear} className="border-b border-edge text-[12px] last:border-0">
                    <td className="num py-2 pr-3 text-ink">FY{fy.fiscalYear}</td>
                    <td className="num py-2 pr-3 text-ink">{money(fy.revenue)}</td>
                    <td className="num py-2 pr-3 text-ink-dim">{money(fy.operatingIncome)}</td>
                    <td className="num py-2 pr-3 text-ink-dim">{money(fy.researchAndDevelopment)}</td>
                    <td className="num py-2 pr-3 text-ink-dim">{money(fy.capex)}</td>
                    <td className="py-2 text-[10.5px] leading-tight text-ink-faint">{fy.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-ink-faint">
            Segment revenue: {company.segmentsNote}
          </p>
        </div>

        <div className="min-w-0">
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            Market &amp; macro snapshot
          </h4>
          <div className="mt-1">
            <Row
              label="Price"
              value={fmtSourced(company.market.price, price)}
              source={company.market.price.source}
            />
            <Row
              label="Market cap"
              value={fmtSourced(company.market.marketCap, money)}
              source={company.market.marketCap.source}
            />
            <Row
              label="Shares outstanding"
              value={fmtSourced(company.market.sharesOutstanding, (v) => `${(v / 1e9).toFixed(2)}B`)}
              source={company.market.sharesOutstanding.source}
            />
            <Row
              label="Beta"
              value={fmtSourced(company.market.beta, (v) => v.toFixed(2))}
              source={`${company.market.beta.source} — ${company.market.beta.method}`}
            />
            <Row
              label="Risk-free rate (10Y)"
              value={fmtSourced(company.riskFreeRate, (v) => pct(v, { digits: 2 }))}
              source={company.riskFreeRate.source}
            />
            <Row
              label="Total debt"
              value={fmtSourced(company.netDebt.totalDebt, money)}
              source={company.netDebt.totalDebt.source}
            />
            <Row
              label="Cash & ST investments"
              value={fmtSourced(company.netDebt.cashAndShortTermInvestments, money)}
              source={company.netDebt.cashAndShortTermInvestments.source}
            />
            <Row
              label="Net debt"
              value={fmtSourced(company.netDebt.netDebt, money)}
              source={company.netDebt.netDebt.source}
            />
            <Row
              label="Working capital"
              value={`AR ${money(latest.accountsReceivable)} / AP ${money(latest.accountsPayable)} / Inv ${money(latest.inventory)}`}
              source={latest.source}
              asOf={latest.periodEnd}
            />
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
            Snapshot committed at build time on {company.generatedAt.slice(0, 10)} — the deployed
            site makes no data API calls and needs no keys. Fields a source could not provide are
            shown as <span className="num">null</span>, never estimated.
          </p>
        </div>
      </div>
    </section>
  );
}
