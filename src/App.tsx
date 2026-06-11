import { useEffect, useMemo, useState } from "react";
import type { CompanyData } from "./engine/companyData";
import { deriveBaseCase } from "./engine/baseCase";
import { runModel, attributeDrivers } from "./engine/dcf";
import type { Overrides } from "./engine/overrides";
import { PRESETS } from "./data/presets";
import { Hero } from "./components/Hero";
import { InputPanel } from "./components/InputPanel";
import { DcfReadout } from "./components/DcfReadout";
import { ProjectionChart } from "./components/ProjectionChart";
import { Waterfall } from "./components/Waterfall";
import { InsightPanel } from "./components/InsightPanel";
import { Assumptions } from "./components/Assumptions";
import { Provenance } from "./components/Provenance";
import { HowItWorks } from "./components/HowItWorks";
import { Footer } from "./components/Footer";

const TICKER = "NVDA";
// First load shows a real company with one preset already applied.
const INITIAL_PRESET = PRESETS[0];

export default function App() {
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [committedTickers, setCommittedTickers] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Overrides>(INITIAL_PRESET.overrides);
  const [presetId, setPresetId] = useState<string | null>(INITIAL_PRESET.id);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}companies/${TICKER}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setCompany)
      .catch((e) => setLoadError(String(e)));
    fetch(`${import.meta.env.BASE_URL}companies/index.json`)
      .then((r) => (r.ok ? r.json() : { tickers: [TICKER] }))
      .then((d: { tickers: string[] }) => setCommittedTickers(d.tickers))
      .catch(() => setCommittedTickers([TICKER]));
  }, []);

  const handleLoadTicker = async (ticker: string) => {
    const { loadCompany } = await import("./lib/loadCompany");
    const next = await loadCompany(ticker);
    setCompany(next);
    // scenario assumptions are company-shaped; reset to the derived base case
    setOverrides({});
    setPresetId("base");
  };

  const base = useMemo(() => (company ? deriveBaseCase(company) : null), [company]);
  const baseOutput = useMemo(
    () => (company && base ? runModel(company, base, {}) : null),
    [company, base],
  );
  const output = useMemo(
    () => (company && base ? runModel(company, base, overrides) : null),
    [company, base, overrides],
  );
  const attribution = useMemo(
    () => (company && base ? attributeDrivers(company, base, overrides) : null),
    [company, base, overrides],
  );

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center text-[13px] text-ink-dim">
        Failed to load the committed company snapshot ({loadError}). Run
        <code className="num mx-1 text-ink"> npm run ingest -- --ticker {TICKER} </code>
        and rebuild.
      </div>
    );
  }
  if (!company || !base || !output || !baseOutput || !attribution) {
    return <div className="min-h-screen" />;
  }

  const scenarioName =
    presetId === "base"
      ? "Base case"
      : (PRESETS.find((p) => p.id === presetId)?.name ?? "Custom scenario");

  const historyFys = company.fiscalYears.filter((f) => f.revenue != null);

  return (
    <div className="min-h-screen">
      <Hero
        company={company}
        baseImplied={baseOutput.impliedPrice}
        scenarioName={scenarioName}
      />

      <main id="tool" className="mx-auto max-w-5xl scroll-mt-8 px-5">
        <div className="rounded-lg border border-edge bg-panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge px-5 py-4">
            <h2 className="text-[14px] font-medium text-ink">
              {company.legalName}
              <span className="num ml-2 text-[12px] text-ink-faint">{company.ticker}</span>
            </h2>
            <span className="text-[12px] text-ink-faint">
              scenario: <span className="text-accent">{scenarioName}</span>
            </span>
          </div>

          <div className="grid gap-8 p-5 lg:grid-cols-[19rem_1fr]">
            <InputPanel
              company={company}
              base={base}
              activePresetId={presetId}
              onApply={(o, id) => {
                setOverrides(o);
                setPresetId(id);
              }}
              onLoadTicker={handleLoadTicker}
              committedTickers={committedTickers}
            />

            <div className="min-w-0 space-y-6">
              <DcfReadout output={output} company={company} />
              <ProjectionChart
                historyLabels={historyFys.map((f) => `FY${f.fiscalYear}`)}
                historyRevenue={historyFys.map((f) => f.revenue!)}
                baseProjection={baseOutput.years.map((y) => y.revenue)}
                scenarioProjection={output.years.map((y) => y.revenue)}
              />
              <div>
                <h3 className="mb-2 text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                  Base → scenario value attribution
                </h3>
                <Waterfall
                  baseEv={attribution.baseEv}
                  scenarioEv={attribution.scenarioEv}
                  steps={attribution.steps}
                />
              </div>
              <div className="border-t border-edge pt-5">
                <InsightPanel overrides={overrides} />
              </div>
              <Assumptions base={base} />
            </div>
          </div>
        </div>
      </main>

      <Provenance company={company} />
      <HowItWorks />
      <Footer company={company} />
    </div>
  );
}
