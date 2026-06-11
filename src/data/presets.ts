import type { Overrides } from "../engine/overrides";

// Canned scenarios, committed with their full override JSON. Clicking one
// revalues instantly with zero API calls. Values are absolute rates
// (decimals); null keeps the data-derived base case for that year.

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  overrides: Overrides;
}

export const PRESETS: Preset[] = [
  {
    id: "ai-digestion",
    name: "AI capex digestion",
    blurb: "Hyperscalers pause; growth halves for three years, recovers by year 6.",
    overrides: {
      revenue_growth_overrides: [0.15, 0.08, 0.12, null, null, null, null, null, null, null],
      operating_margin_overrides: [0.54, 0.5, 0.52, null, null, null, null, null, null, null],
      recovery_path: { return_year: 6, mode: "linear" },
      confidence_scores: { revenue_growth: 6, operating_margin: 5, recovery_path: 4 },
      macro_thesis:
        "Cloud capex cycles digest after two years of record buildout, freezing accelerator orders before AI revenue catches up.",
      cfo_pushback:
        "Year-2 growth of 8% assumes hyperscalers cut orders mid-contract; backlog and multi-year supply agreements argue the trough is shallower.",
      consistency_flags: [],
    },
  },
  {
    id: "margin-compression",
    name: "Competition compresses margins",
    blurb: "Custom silicon and rivals push operating margin toward 40% by year 5.",
    overrides: {
      operating_margin_overrides: [0.56, 0.52, 0.48, 0.44, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
      gross_margin_overrides: [0.7, 0.67, 0.64, 0.62, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
      confidence_scores: { operating_margin: 7, gross_margin: 6 },
      macro_thesis:
        "In-house accelerators at the largest customers and a credible merchant rival turn pricing power into a margin war.",
      cfo_pushback:
        "A 60% terminal gross margin still assumes meaningful pricing power; if the software moat holds, margins may never leave the high 60s.",
      consistency_flags: [
        "Margin path assumes no offsetting opex cuts; in practice R&D would be rationalized.",
      ],
    },
  },
  {
    id: "recession-recovery",
    name: "Recession, recovery in year 4",
    blurb: "Demand contracts in years 1–2, returns to the base trajectory by year 4.",
    overrides: {
      revenue_growth_overrides: [0.05, -0.08, null, null, null, null, null, null, null, null],
      operating_margin_overrides: [0.52, 0.46, null, null, null, null, null, null, null, null],
      recovery_path: { return_year: 4, mode: "linear" },
      wacc_override: { bps: 75, justification: "equity_risk_premium" },
      confidence_scores: { revenue_growth: 5, operating_margin: 5, wacc: 4 },
      macro_thesis:
        "A broad recession hits enterprise IT budgets; AI infrastructure is deferred, not cancelled, so the base trajectory resumes by year 4.",
      cfo_pushback:
        "The +75bps risk-premium bump double-counts the downturn already embedded in the negative growth year.",
      consistency_flags: [],
    },
  },
  {
    id: "bull-sustained",
    name: "Bull: sustained AI demand",
    blurb: "Growth holds near 40% for three years; terminal growth at 3%.",
    overrides: {
      revenue_growth_overrides: [0.42, 0.38, 0.32, 0.26, 0.21, null, null, null, null, null],
      terminal_growth_override: 0.03,
      confidence_scores: { revenue_growth: 6, terminal_growth: 3 },
      macro_thesis:
        "Inference demand compounds on top of training; sovereign and enterprise buildouts extend the cycle well past the historical capex pattern.",
      cfo_pushback:
        "A 3% terminal growth rate prices in permanent share gains; terminal assumptions drive most of the upside and deserve the most skepticism.",
      consistency_flags: [
        "Sustained 40% growth with unchanged capex intensity may understate the investment needed to serve it.",
      ],
    },
  },
  {
    id: "rates-shock",
    name: "Rates shock +150bps",
    blurb: "Pure discount-rate move: risk-free repricing, fundamentals untouched.",
    overrides: {
      wacc_override: { bps: 150, justification: "risk_free" },
      terminal_growth_override: 0.02,
      confidence_scores: { wacc: 8, terminal_growth: 6 },
      macro_thesis:
        "Term premium returns: 10-year yields reprice 150bps higher on fiscal supply, lifting every discount rate with no change to operations.",
      cfo_pushback:
        "If long rates rise on stronger nominal growth, revenue should also be marked up — discounting alone overstates the damage.",
      consistency_flags: [],
    },
  },
];
