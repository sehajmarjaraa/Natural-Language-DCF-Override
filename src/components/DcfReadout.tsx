import type { ModelOutput } from "../engine/dcf";
import type { CompanyData } from "../engine/companyData";
import { useAnimatedNumber } from "../hooks/useAnimated";
import { money, pct, price } from "../lib/format";

interface Props {
  output: ModelOutput;
  company: CompanyData;
}

function Cell({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">{label}</div>
      <div className="num mt-0.5 truncate text-[15px] text-ink">{children}</div>
      {hint && <div className="mt-0.5 truncate text-[10px] text-ink-faint">{hint}</div>}
    </div>
  );
}

export function DcfReadout({ output, company }: Props) {
  const implied = useAnimatedNumber(output.impliedPrice);
  const upside = useAnimatedNumber(output.upside);
  const up = (output.upside ?? 0) >= 0;

  return (
    <div className="rounded-md border border-edge bg-panel-2 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            Implied share price
          </div>
          <div className="num text-4xl font-medium tracking-tight text-ink">
            {price(implied)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            vs {price(output.snapshotPrice)} ({company.market.price.asOf ?? "n/a"})
          </div>
          <div
            className="num text-2xl font-medium tracking-tight"
            style={{ color: up ? "var(--color-up)" : "var(--color-down)" }}
          >
            {pct(upside, { sign: true })}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-edge pt-3 sm:grid-cols-4">
        <Cell label="Enterprise value">{money(output.enterpriseValue)}</Cell>
        <Cell label="Equity value" hint={`less net debt ${money(output.netDebt)}`}>
          {money(output.equityValue)}
        </Cell>
        <Cell label="WACC">{pct(output.wacc, { digits: 2 })}</Cell>
        <Cell label="Terminal growth">{pct(output.terminalGrowth, { digits: 1 })}</Cell>
        <Cell label="PV of years 1–10">{money(output.pvExplicit)}</Cell>
        <Cell label="PV of terminal value" hint={`${pct(output.pvTerminal / output.enterpriseValue, { digits: 0 })} of EV`}>
          {money(output.pvTerminal)}
        </Cell>
        <Cell label="Shares outstanding">
          {output.sharesOutstanding ? `${(output.sharesOutstanding / 1e9).toFixed(2)}B` : "—"}
        </Cell>
        <Cell label="Year-10 FCF">{money(output.years[9].fcf)}</Cell>
      </div>
      <p className="mt-3 border-t border-edge pt-2.5 text-[10.5px] leading-snug text-ink-faint">
        Mid-year discounting convention. Terminal value normalizes reinvestment: capex = D&amp;A
        in perpetuity, so a peak investment cycle isn't extrapolated forever. Beta is
        Blume-adjusted (2/3 raw + 1/3 market) — full build in the assumptions panel below.
      </p>
    </div>
  );
}
