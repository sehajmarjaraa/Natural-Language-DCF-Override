import type { WaterfallStep } from "../engine/dcf";
import { money } from "../lib/format";

interface Props {
  baseEv: number;
  scenarioEv: number;
  steps: WaterfallStep[];
}

/** Horizontal driver-attribution waterfall: base EV -> driver deltas -> scenario EV. */
export function Waterfall({ baseEv, scenarioEv, steps }: Props) {
  const rows = [
    { label: "Base case EV", value: baseEv, kind: "anchor" as const },
    ...steps.map((s) => ({ label: s.label, value: s.delta, kind: "delta" as const })),
    { label: "Scenario EV", value: scenarioEv, kind: "anchor" as const },
  ];
  const maxAbs = Math.max(baseEv, scenarioEv, ...steps.map((s) => Math.abs(s.delta)), 1);

  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const w = Math.max(1.5, (Math.abs(r.value) / maxAbs) * 100);
        const isZero = r.kind === "delta" && Math.abs(r.value) < 1e6;
        const color =
          r.kind === "anchor"
            ? "var(--color-ink-dim)"
            : isZero
              ? "var(--color-ink-faint)"
              : r.value >= 0
                ? "var(--color-up)"
                : "var(--color-down)";
        return (
          <div key={i} className="flex items-center gap-3 text-[12px]">
            <span className="w-40 shrink-0 truncate text-ink-dim">{r.label}</span>
            <div className="relative h-4 flex-1 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-sm transition-all duration-500 ease-out"
                style={{ width: `${w}%`, background: color, opacity: r.kind === "anchor" ? 0.45 : 0.85 }}
              />
            </div>
            <span className="num w-20 shrink-0 text-right" style={{ color }}>
              {r.kind === "delta" ? money(r.value, { sign: true }) : money(r.value)}
            </span>
          </div>
        );
      })}
      <p className="pt-1 text-[11px] leading-snug text-ink-faint">
        Sequential attribution: drivers applied in the order shown, so interaction effects land in
        the later steps.
      </p>
    </div>
  );
}
