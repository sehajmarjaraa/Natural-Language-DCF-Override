import { useState } from "react";
import type { BaseCase } from "../engine/baseCase";
import type { CompanyData } from "../engine/companyData";
import type { Overrides } from "../engine/overrides";
import { PRESETS } from "../data/presets";
import { translateScenario } from "../lib/anthropic";
import { pct } from "../lib/format";

type Mode = "presets" | "sliders" | "language";

interface Props {
  company: CompanyData;
  base: BaseCase;
  activePresetId: string | null;
  onApply: (overrides: Overrides, presetId: string | null) => void;
  onLoadTicker: (ticker: string) => Promise<void>;
  committedTickers: string[];
}

interface SliderState {
  growthDeltaPp: number; // applied to every year of the base growth path
  marginDeltaPp: number;
  capexDeltaPp: number;
  waccDeltaBps: number;
  terminalGrowthPct: number;
  dsoDelta: number;
}

const SLIDER_DEFAULTS: SliderState = {
  growthDeltaPp: 0,
  marginDeltaPp: 0,
  capexDeltaPp: 0,
  waccDeltaBps: 0,
  terminalGrowthPct: 2.5,
  dsoDelta: 0,
};

function slidersToOverrides(s: SliderState, base: BaseCase): Overrides {
  // Sliders emit the exact same override object as presets and the LLM, so
  // every input mode hits the identical engine path.
  const o: Overrides = {};
  if (s.growthDeltaPp !== 0)
    o.revenue_growth_overrides = base.revenueGrowthPath.map((g) => g + s.growthDeltaPp / 100);
  if (s.marginDeltaPp !== 0)
    o.operating_margin_overrides = Array(10).fill(base.operatingMargin.value + s.marginDeltaPp / 100);
  if (s.capexDeltaPp !== 0)
    o.capex_overrides = Array(10).fill(base.capexPctOfRevenue.value + s.capexDeltaPp / 100);
  if (s.waccDeltaBps !== 0)
    o.wacc_override = { bps: s.waccDeltaBps, justification: "equity_risk_premium" };
  if (Math.abs(s.terminalGrowthPct - base.terminalGrowth.value * 100) > 0.01)
    o.terminal_growth_override = s.terminalGrowthPct / 100;
  if (s.dsoDelta !== 0)
    o.working_capital_overrides = { dso: base.dso.value + s.dsoDelta };
  return o;
}

function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
        <span className="text-ink-dim">{label}</span>
        <span className="num text-ink">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </label>
  );
}

export function InputPanel({
  company,
  base,
  activePresetId,
  onApply,
  onLoadTicker,
  committedTickers,
}: Props) {
  const [mode, setMode] = useState<Mode>("presets");
  const [sliders, setSliders] = useState<SliderState>(SLIDER_DEFAULTS);
  const [apiKey, setApiKey] = useState("");
  const [scenario, setScenario] = useState("");
  const [ticker, setTicker] = useState(company.ticker);
  const [tickerBusy, setTickerBusy] = useState(false);
  const [tickerError, setTickerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTicker = async () => {
    const t = ticker.trim().toUpperCase();
    if (!t || t === company.ticker) return;
    setTickerError(null);
    setTickerBusy(true);
    try {
      await onLoadTicker(t);
      setSliders(SLIDER_DEFAULTS);
    } catch (e) {
      setTickerError((e as Error).message);
    } finally {
      setTickerBusy(false);
    }
  };

  const setSlider = (patch: Partial<SliderState>) => {
    const next = { ...sliders, ...patch };
    setSliders(next);
    onApply(slidersToOverrides(next, base), null);
  };

  const runLanguage = async () => {
    setError(null);
    if (!apiKey.trim() || !scenario.trim()) {
      setError("Both a scenario and an Anthropic API key are required.");
      return;
    }
    setBusy(true);
    try {
      const overrides = await translateScenario(apiKey.trim(), scenario.trim(), company, base);
      onApply(overrides, null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const tab = (m: Mode, label: string) => (
    <button
      key={m}
      onClick={() => setMode(m)}
      className={`rounded-sm px-3 py-1.5 text-[12px] transition-colors ${
        mode === m ? "bg-edge text-ink" : "text-ink-faint hover:text-ink-dim"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-edge pb-3">
        {tab("presets", "Presets")}
        {tab("sliders", "Manual")}
        {tab("language", "Try it yourself")}
      </div>

      {mode === "presets" && (
        <div className="space-y-2 fade-up">
          <button
            onClick={() => onApply({}, "base")}
            className={`w-full rounded-md border p-3 text-left transition-colors ${
              activePresetId === "base"
                ? "border-accent/50 bg-panel-2"
                : "border-edge hover:border-edge-2"
            }`}
          >
            <div className="text-[13px] font-medium text-ink">Base case</div>
            <div className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">
              No overrides — assumptions derived from filings and market data only.
            </div>
          </button>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => onApply(p.overrides, p.id)}
              className={`w-full rounded-md border p-3 text-left transition-colors ${
                activePresetId === p.id
                  ? "border-accent/50 bg-panel-2"
                  : "border-edge hover:border-edge-2"
              }`}
            >
              <div className="text-[13px] font-medium text-ink">{p.name}</div>
              <div className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">{p.blurb}</div>
            </button>
          ))}
          <p className="pt-1 text-[11px] text-ink-faint">
            Committed override JSON — zero API calls, instant revaluation.
          </p>
        </div>
      )}

      {mode === "sliders" && (
        <div className="space-y-5 fade-up">
          <Slider
            label="Revenue growth, all years"
            value={sliders.growthDeltaPp}
            display={`${sliders.growthDeltaPp >= 0 ? "+" : ""}${sliders.growthDeltaPp.toFixed(0)}pp vs base`}
            min={-25}
            max={20}
            step={1}
            onChange={(v) => setSlider({ growthDeltaPp: v })}
          />
          <Slider
            label="Operating margin"
            value={sliders.marginDeltaPp}
            display={`${pct(base.operatingMargin.value + sliders.marginDeltaPp / 100)} (${sliders.marginDeltaPp >= 0 ? "+" : ""}${sliders.marginDeltaPp.toFixed(0)}pp)`}
            min={-25}
            max={10}
            step={1}
            onChange={(v) => setSlider({ marginDeltaPp: v })}
          />
          <Slider
            label="Capex, % of revenue"
            value={sliders.capexDeltaPp}
            display={pct(base.capexPctOfRevenue.value + sliders.capexDeltaPp / 100)}
            min={-2}
            max={10}
            step={0.5}
            onChange={(v) => setSlider({ capexDeltaPp: v })}
          />
          <Slider
            label="WACC shift"
            value={sliders.waccDeltaBps}
            display={`${sliders.waccDeltaBps >= 0 ? "+" : ""}${sliders.waccDeltaBps}bps → ${pct(base.wacc.wacc + sliders.waccDeltaBps / 10000, { digits: 2 })}`}
            min={-300}
            max={300}
            step={25}
            onChange={(v) => setSlider({ waccDeltaBps: v })}
          />
          <Slider
            label="Terminal growth"
            value={sliders.terminalGrowthPct}
            display={`${sliders.terminalGrowthPct.toFixed(1)}%`}
            min={0}
            max={4}
            step={0.1}
            onChange={(v) => setSlider({ terminalGrowthPct: v })}
          />
          <Slider
            label="DSO (receivable days)"
            value={sliders.dsoDelta}
            display={`${(base.dso.value + sliders.dsoDelta).toFixed(0)} days`}
            min={-30}
            max={60}
            step={5}
            onChange={(v) => setSlider({ dsoDelta: v })}
          />
          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-ink-faint">
              Same override object as the AI path — identical engine.
            </p>
            <button
              onClick={() => {
                setSliders(SLIDER_DEFAULTS);
                onApply({}, "base");
              }}
              className="text-[11px] text-ink-dim underline-offset-2 hover:underline"
            >
              reset
            </button>
          </div>
        </div>
      )}

      {mode === "language" && (
        <div className="space-y-3 fade-up">
          <div>
            <label className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              Company
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && loadTicker()}
                placeholder="Ticker, e.g. AAPL"
                autoComplete="off"
                spellCheck={false}
                className="num min-w-0 flex-1 rounded-md border border-edge bg-panel-2 p-3 text-[12px] uppercase text-ink placeholder:normal-case placeholder:text-ink-faint focus:border-edge-2 focus:outline-none"
              />
              <button
                onClick={loadTicker}
                disabled={tickerBusy || ticker.trim().toUpperCase() === company.ticker}
                className="shrink-0 rounded-md border border-edge px-4 text-[12px] text-ink transition-colors hover:border-edge-2 disabled:opacity-40"
              >
                {tickerBusy ? "Loading…" : "Load"}
              </button>
            </div>
            {tickerError && <p className="mt-1.5 text-[12px] leading-snug text-down">{tickerError}</p>}
            <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">
              {committedTickers.join(", ")} are free to explore — press Load and the presets,
              sliders, and full readout switch to that company, no key needed. To run your own
              personalised scenario on it, describe it below and add your Anthropic API key.
              Other tickers aren't in this build (SEC's API blocks in-browser reads); they can
              be added with one ingest command.
            </p>
          </div>
          <textarea
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            rows={5}
            placeholder={`Describe a scenario, e.g.\n"Mild recession next year, data-center demand pauses for two years then recovers by 2030, and rates stay 100bps higher."`}
            className="w-full resize-none rounded-md border border-edge bg-panel-2 p-3 text-[13px] leading-relaxed text-ink placeholder:text-ink-faint focus:border-edge-2 focus:outline-none"
          />
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Anthropic API key (sk-ant-…)"
            autoComplete="off"
            className="num w-full rounded-md border border-edge bg-panel-2 p-3 text-[12px] text-ink placeholder:text-ink-faint focus:border-edge-2 focus:outline-none"
          />
          <button
            onClick={runLanguage}
            disabled={busy}
            className="w-full rounded-md bg-accent/90 py-2.5 text-[13px] font-medium text-bg transition-colors hover:bg-accent disabled:opacity-50"
          >
            {busy ? "Translating scenario…" : "Translate & revalue"}
          </button>
          {error && <p className="text-[12px] leading-snug text-down">{error}</p>}
          <p className="text-[11px] leading-relaxed text-ink-faint">
            One call to the Anthropic API on your own key. The key lives in this page's memory
            only — never stored, never sent anywhere except api.anthropic.com. The model returns
            only override assumptions; every number on screen is computed locally by the
            deterministic engine.
          </p>
        </div>
      )}
    </div>
  );
}
