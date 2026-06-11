import type { Overrides } from "../engine/overrides";

interface Props {
  overrides: Overrides;
}

const CONFIDENCE_LABELS: Record<string, string> = {
  revenue_growth: "Revenue growth",
  operating_margin: "Operating margin",
  gross_margin: "Gross margin",
  opex: "Opex",
  working_capital: "Working capital",
  capex: "Capex",
  terminal_growth: "Terminal growth",
  wacc: "WACC",
  recovery_path: "Recovery path",
};

export function InsightPanel({ overrides }: Props) {
  const conf = Object.entries(overrides.confidence_scores ?? {});
  const flags = overrides.consistency_flags ?? [];
  const hasAnything = overrides.macro_thesis || overrides.cfo_pushback || conf.length || flags.length;
  if (!hasAnything) {
    return (
      <p className="text-[12px] text-ink-faint">
        Manual scenario — no thesis attached. Apply a preset or describe a scenario in plain
        English to see the macro thesis, CFO pushback, and confidence panel.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {overrides.macro_thesis && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">Macro thesis</h4>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">{overrides.macro_thesis}</p>
        </div>
      )}
      {overrides.cfo_pushback && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">CFO pushback</h4>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">{overrides.cfo_pushback}</p>
        </div>
      )}
      {conf.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            Confidence — stated vs inferred
          </h4>
          <div className="mt-2 space-y-1.5">
            {conf.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-[12px]">
                <span className="w-32 shrink-0 text-ink-dim">{CONFIDENCE_LABELS[k] ?? k}</span>
                <div className="h-1 flex-1 rounded bg-edge">
                  <div
                    className="h-1 rounded bg-accent transition-all duration-300"
                    style={{ width: `${(v / 10) * 100}%` }}
                  />
                </div>
                <span className="num w-10 shrink-0 text-right text-ink-faint">{v}/10</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {flags.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            Consistency flags
          </h4>
          <ul className="mt-1 space-y-1">
            {flags.map((f, i) => (
              <li key={i} className="flex gap-2 text-[12px] leading-snug text-ink-dim">
                <span className="text-down">▲</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
