import { useState } from "react";
import type { BaseCase } from "../engine/baseCase";
import { pct } from "../lib/format";

interface Props {
  base: BaseCase;
}

/** The base case with its full derivation — nothing is a bare number. */
export function Assumptions({ base }: Props) {
  const [open, setOpen] = useState(false);
  const rows: Array<{ label: string; value: string; derivation: string }> = [
    {
      label: "Revenue growth path",
      value: `${pct(base.revenueGrowthPath[0])} → ${pct(base.revenueGrowthPath[9])}`,
      derivation: base.growthDerivation,
    },
    { label: "Gross margin", value: pct(base.grossMargin.value), derivation: base.grossMargin.derivation },
    { label: "Operating margin", value: pct(base.operatingMargin.value), derivation: base.operatingMargin.derivation },
    { label: "R&D / revenue", value: pct(base.rndPctOfRevenue.value), derivation: base.rndPctOfRevenue.derivation },
    { label: "SG&A / revenue", value: pct(base.sgaPctOfRevenue.value), derivation: base.sgaPctOfRevenue.derivation },
    { label: "D&A / revenue", value: pct(base.dnaPctOfRevenue.value), derivation: base.dnaPctOfRevenue.derivation },
    { label: "Capex / revenue", value: pct(base.capexPctOfRevenue.value), derivation: base.capexPctOfRevenue.derivation },
    { label: "DSO / DPO / DIO", value: `${base.dso.value.toFixed(0)} / ${base.dpo.value.toFixed(0)} / ${base.dio.value.toFixed(0)}d`, derivation: `${base.dso.derivation} ${base.dpo.derivation} ${base.dio.derivation}` },
    { label: "Tax rate", value: pct(base.taxRate.value), derivation: base.taxRate.derivation },
    { label: "WACC", value: pct(base.wacc.wacc, { digits: 2 }), derivation: base.wacc.derivation },
    { label: "Terminal growth", value: pct(base.terminalGrowth.value), derivation: base.terminalGrowth.derivation },
  ];

  return (
    <div className="rounded-md border border-edge">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-[12px] font-medium text-ink">
          Base-case assumptions &amp; where each came from
        </span>
        <span className="text-ink-faint transition-transform duration-200" style={{ transform: open ? "rotate(90deg)" : "none" }}>
          ›
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-edge px-4 py-2">
            {rows.map((r) => (
              <div key={r.label} className="border-b border-edge py-2.5 last:border-0">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[12px] text-ink-dim">{r.label}</span>
                  <span className="num shrink-0 text-[12px] text-ink">{r.value}</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-ink-faint">{r.derivation}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
