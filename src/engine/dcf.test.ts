import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CompanyData } from "./companyData";
import { deriveBaseCase } from "./baseCase";
import { runModel, attributeDrivers } from "./dcf";
import { clampOverrides, OverridesSchema } from "./overrides";

const company: CompanyData = JSON.parse(
  readFileSync(join(__dirname, "../../public/companies/NVDA.json"), "utf8"),
);
const base = deriveBaseCase(company);

describe("engine", () => {
  it("is deterministic", () => {
    const a = runModel(company, base, {});
    const b = runModel(company, base, {});
    expect(a).toEqual(b);
  });

  it("produces finite, internally consistent output", () => {
    const out = runModel(company, base, {});
    expect(out.years).toHaveLength(10);
    expect(out.enterpriseValue).toBeGreaterThan(0);
    expect(out.enterpriseValue).toBeCloseTo(out.pvExplicit + out.pvTerminal, 4);
    if (out.netDebt != null) {
      expect(out.equityValue).toBeCloseTo(out.enterpriseValue - out.netDebt, 4);
    }
  });

  it("clamps insane overrides", () => {
    const o = clampOverrides({
      revenue_growth_overrides: [5, -5, null, null, null, null, null, null, null, null],
      terminal_growth_override: 0.2,
      wacc_override: { bps: 10_000, justification: "beta" },
    });
    expect(o.revenue_growth_overrides![0]).toBe(0.6);
    expect(o.revenue_growth_overrides![1]).toBe(-0.5);
    expect(o.terminal_growth_override).toBe(0.04);
    expect(o.wacc_override!.bps).toBe(500);
  });

  it("keeps terminal growth below WACC even when overridden upward", () => {
    const out = runModel(company, base, {
      terminal_growth_override: 0.04,
      wacc_override: { bps: -500, justification: "risk_free" },
    });
    expect(out.terminalGrowth).toBeLessThan(out.wacc);
    expect(out.terminalValue).toBeGreaterThan(0);
  });

  it("recovery_path returns metrics to base at the stated year", () => {
    const out = runModel(company, base, {
      revenue_growth_overrides: [0.05, null, null, null, null, null, null, null, null, null],
      recovery_path: { return_year: 4, mode: "linear" },
    });
    const baseOut = runModel(company, base, {});
    expect(out.years[0].growth).toBeCloseTo(0.05, 10);
    // linear path back: years 2-3 between the shock and base
    expect(out.years[1].growth).toBeGreaterThan(0.05);
    expect(out.years[1].growth).toBeLessThan(baseOut.years[1].growth);
    // back on base from return_year onward
    for (let i = 3; i < 10; i++) {
      expect(out.years[i].growth).toBeCloseTo(baseOut.years[i].growth, 10);
    }
  });

  it("step recovery holds the shock value until the return year", () => {
    const out = runModel(company, base, {
      revenue_growth_overrides: [0.05, null, null, null, null, null, null, null, null, null],
      recovery_path: { return_year: 4, mode: "step" },
    });
    expect(out.years[1].growth).toBeCloseTo(0.05, 10);
    expect(out.years[2].growth).toBeCloseTo(0.05, 10);
    const baseOut = runModel(company, base, {});
    expect(out.years[3].growth).toBeCloseTo(baseOut.years[3].growth, 10);
  });

  it("waterfall deltas sum from base EV to scenario EV", () => {
    const overrides = {
      revenue_growth_overrides: [0.1, 0.1, null, null, null, null, null, null, null, null],
      operating_margin_overrides: Array(10).fill(0.5),
      wacc_override: { bps: 100, justification: "equity_risk_premium" as const },
      terminal_growth_override: 0.02,
    };
    const att = attributeDrivers(company, base, overrides);
    const sum = att.baseEv + att.steps.reduce((a, s) => a + s.delta, 0);
    expect(sum).toBeCloseTo(att.scenarioEv, 2);
    expect(att.scenarioEv).toBeCloseTo(
      runModel(company, base, overrides).enterpriseValue,
      2,
    );
  });

  it("empty overrides parse and equal the base case", () => {
    expect(OverridesSchema.safeParse({}).success).toBe(true);
    const out = runModel(company, base, {});
    const out2 = runModel(company, base, OverridesSchema.parse({}));
    expect(out.enterpriseValue).toBe(out2.enterpriseValue);
  });
});
