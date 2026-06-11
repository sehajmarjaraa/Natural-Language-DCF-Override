import type { CompanyData } from "../engine/companyData";
import { price, pct } from "../lib/format";

interface Props {
  company: CompanyData;
  baseImplied: number | null;
  scenarioName: string;
}

export function Hero({ company, baseImplied, scenarioName }: Props) {
  const snap = company.market.price.value;
  const upside = baseImplied != null && snap ? baseImplied / snap - 1 : null;

  return (
    <header className="mx-auto max-w-5xl px-5 pb-20 pt-24 sm:pt-32">
      <div className="flex items-center gap-2 text-[12px] text-ink-faint">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
        scenario-engine
      </div>
      <h1 className="mt-5 max-w-3xl text-4xl font-medium leading-[1.08] tracking-tight text-ink sm:text-5xl">
        Say what happens to the economy.
        <br />
        <span className="text-ink-dim">Watch what happens to the valuation.</span>
      </h1>
      <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-dim">
        A deterministic DCF built from {company.legalName}'s real SEC filings, revalued live as
        you perturb it — with sliders, presets, or a sentence of plain English. Every number is
        sourced and dated. The only thing the LLM does is translate language into assumptions.
      </p>

      <div className="mt-10 grid max-w-2xl grid-cols-2 gap-px overflow-hidden rounded-md border border-edge bg-edge sm:grid-cols-3">
        <div className="bg-panel p-4">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            {company.ticker} · market price
          </div>
          <div className="num mt-1 text-2xl text-ink">{price(snap)}</div>
          <div className="mt-0.5 text-[10px] text-ink-faint">as of {company.market.price.asOf ?? "n/a"}</div>
        </div>
        <div className="bg-panel p-4">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            base-case implied
          </div>
          <div className="num mt-1 text-2xl text-ink">{price(baseImplied)}</div>
          <div
            className="num mt-0.5 text-[10px]"
            style={{ color: (upside ?? 0) >= 0 ? "var(--color-up)" : "var(--color-down)" }}
          >
            {pct(upside, { sign: true })} vs market
          </div>
        </div>
        <div className="col-span-2 bg-panel p-4 sm:col-span-1">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            scenario applied
          </div>
          <div className="mt-1 truncate text-[14px] leading-8 text-accent">{scenarioName}</div>
          <div className="mt-0.5 text-[10px] text-ink-faint">live below — change it</div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <a
          href="#tool"
          className="rounded-md bg-ink px-4 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-85"
        >
          Open the model ↓
        </a>
        <span className="text-[12px] text-ink-faint">
          Built by{" "}
          <span className="text-ink-dim">Sehaj Marjara</span> ·{" "}
          <a href="https://www.linkedin.com/in/sehajmarjara/" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-ink-dim hover:underline">LinkedIn</a> ·{" "}
          <a href="https://github.com/sehajmarjaraa" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-ink-dim hover:underline">GitHub</a> ·{" "}
          <a href="resume.pdf" className="underline-offset-2 hover:text-ink-dim hover:underline">Resume</a>
        </span>
      </div>
    </header>
  );
}
