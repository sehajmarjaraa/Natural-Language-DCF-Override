import { z } from "zod";

// The single override object. Presets, sliders, and the LLM all emit this
// shape, so every input mode drives the engine through the identical path.
// Rates are decimals (0.25 = 25%). null = keep the base-case value.

const yearly = z
  .array(z.number().nullable())
  .length(10)
  .describe("10 entries, one per projection year; null keeps the base case");

export const OverridesSchema = z.object({
  revenue_growth_overrides: yearly.optional(),
  operating_margin_overrides: yearly.optional(),
  gross_margin_overrides: yearly.optional(),
  opex_overrides: z
    .object({
      rnd: z.number().nullable().optional(),
      sm: z.number().nullable().optional(),
      ga: z.number().nullable().optional(),
    })
    .optional(),
  working_capital_overrides: z
    .object({
      dso: z.number().nullable().optional(),
      dpo: z.number().nullable().optional(),
      dio: z.number().nullable().optional(),
    })
    .optional(),
  capex_overrides: yearly.optional(),
  terminal_growth_override: z.number().nullable().optional(),
  wacc_override: z
    .object({
      bps: z.number(),
      justification: z.enum(["equity_risk_premium", "beta", "risk_free"]),
    })
    .nullable()
    .optional(),
  recovery_path: z
    .object({
      return_year: z.number().int().min(1).max(10),
      mode: z.enum(["linear", "step"]),
    })
    .nullable()
    .optional(),
  confidence_scores: z
    .record(z.string(), z.number().min(1).max(10))
    .optional()
    .describe("per-override confidence, 1 (inferred guess) to 10 (stated explicitly)"),
  macro_thesis: z.string().optional(),
  cfo_pushback: z.string().optional(),
  consistency_flags: z.array(z.string()).optional(),
});

export type Overrides = z.infer<typeof OverridesSchema>;

export const EMPTY_OVERRIDES: Overrides = {};

// ------------------------------------------------------------- clamping ----

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function clampYearly(
  arr: Array<number | null> | undefined,
  lo: number,
  hi: number,
): Array<number | null> | undefined {
  return arr?.map((v) => (v == null ? null : clamp(v, lo, hi)));
}

/** Bound every override to sane ranges before it touches the model. */
export function clampOverrides(o: Overrides): Overrides {
  return {
    ...o,
    revenue_growth_overrides: clampYearly(o.revenue_growth_overrides, -0.5, 0.6),
    operating_margin_overrides: clampYearly(o.operating_margin_overrides, -0.2, 0.8),
    gross_margin_overrides: clampYearly(o.gross_margin_overrides, 0.05, 0.95),
    capex_overrides: clampYearly(o.capex_overrides, 0, 0.5),
    opex_overrides: o.opex_overrides && {
      rnd: o.opex_overrides.rnd == null ? o.opex_overrides.rnd : clamp(o.opex_overrides.rnd, 0, 0.6),
      sm: o.opex_overrides.sm == null ? o.opex_overrides.sm : clamp(o.opex_overrides.sm, 0, 0.6),
      ga: o.opex_overrides.ga == null ? o.opex_overrides.ga : clamp(o.opex_overrides.ga, 0, 0.6),
    },
    working_capital_overrides: o.working_capital_overrides && {
      dso:
        o.working_capital_overrides.dso == null
          ? o.working_capital_overrides.dso
          : clamp(o.working_capital_overrides.dso, 0, 365),
      dpo:
        o.working_capital_overrides.dpo == null
          ? o.working_capital_overrides.dpo
          : clamp(o.working_capital_overrides.dpo, 0, 365),
      dio:
        o.working_capital_overrides.dio == null
          ? o.working_capital_overrides.dio
          : clamp(o.working_capital_overrides.dio, 0, 365),
    },
    terminal_growth_override:
      o.terminal_growth_override == null
        ? o.terminal_growth_override
        : clamp(o.terminal_growth_override, 0, 0.04),
    wacc_override: o.wacc_override && {
      ...o.wacc_override,
      bps: clamp(o.wacc_override.bps, -500, 500),
    },
  };
}
