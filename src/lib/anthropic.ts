import Anthropic from "@anthropic-ai/sdk";
import { OverridesSchema, type Overrides } from "../engine/overrides";
import type { BaseCase } from "../engine/baseCase";
import type { CompanyData } from "../engine/companyData";

// Natural-language mode: ONE LLM call translates the visitor's scenario text
// into the override object. The LLM never produces a financial figure shown
// on screen — only override assumptions, which are schema-validated, clamped,
// and then run through the same deterministic engine as presets and sliders.
//
// The visitor's API key lives in React state only (never persisted) and is
// sent nowhere except api.anthropic.com.

const MODEL = "claude-opus-4-8";

// JSON Schema mirror of OverridesSchema for the API's structured-output mode.
const yearly = {
  type: "array",
  items: { type: ["number", "null"] },
  minItems: 10,
  maxItems: 10,
};

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    revenue_growth_overrides: yearly,
    operating_margin_overrides: yearly,
    gross_margin_overrides: yearly,
    opex_overrides: {
      type: "object",
      additionalProperties: false,
      properties: {
        rnd: { type: ["number", "null"] },
        sm: { type: ["number", "null"] },
        ga: { type: ["number", "null"] },
      },
    },
    working_capital_overrides: {
      type: "object",
      additionalProperties: false,
      properties: {
        dso: { type: ["number", "null"] },
        dpo: { type: ["number", "null"] },
        dio: { type: ["number", "null"] },
      },
    },
    capex_overrides: yearly,
    terminal_growth_override: { type: ["number", "null"] },
    wacc_override: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        bps: { type: "number" },
        justification: {
          type: "string",
          enum: ["equity_risk_premium", "beta", "risk_free"],
        },
      },
      required: ["bps", "justification"],
    },
    recovery_path: {
      type: ["object", "null"],
      additionalProperties: false,
      properties: {
        return_year: { type: "integer" },
        mode: { type: "string", enum: ["linear", "step"] },
      },
      required: ["return_year", "mode"],
    },
    confidence_scores: {
      type: "object",
      additionalProperties: { type: "number" },
    },
    macro_thesis: { type: "string" },
    cfo_pushback: { type: "string" },
    consistency_flags: { type: "array", items: { type: "string" } },
  },
  required: ["macro_thesis", "cfo_pushback", "consistency_flags"],
} as const;

function systemPrompt(company: CompanyData, base: BaseCase): string {
  return [
    `You translate a plain-English market scenario into DCF override values for ${company.legalName} (${company.ticker}). You never invent financial facts — you only map the user's stated scenario onto the override schema. A deterministic model computes all valuations.`,
    ``,
    `Base case (derived from SEC filings and market data; overrides replace these values):`,
    `- 10y revenue growth path (decimals): ${base.revenueGrowthPath.map((g) => g.toFixed(3)).join(", ")}`,
    `- Operating margin: ${base.operatingMargin.value.toFixed(3)}, gross margin: ${base.grossMargin.value.toFixed(3)}`,
    `- R&D ${base.rndPctOfRevenue.value.toFixed(3)} and SG&A ${base.sgaPctOfRevenue.value.toFixed(3)} of revenue`,
    `- Capex ${base.capexPctOfRevenue.value.toFixed(3)} of revenue; DSO ${base.dso.value.toFixed(0)} / DPO ${base.dpo.value.toFixed(0)} / DIO ${base.dio.value.toFixed(0)} days`,
    `- WACC ${base.wacc.wacc.toFixed(4)} (risk-free ${base.wacc.riskFree.toFixed(4)}, beta ${base.wacc.beta.toFixed(2)}, ERP ${base.wacc.equityRiskPremium.toFixed(3)}); terminal growth ${base.terminalGrowth.value.toFixed(3)}`,
    ``,
    `Rules:`,
    `- All rates are decimals (0.25 = 25%). Yearly arrays have exactly 10 entries; use null for years the scenario does not touch.`,
    `- Only override what the scenario implies. If it implies a temporary shock, set recovery_path.`,
    `- wacc_override.bps is the shift in basis points with the justification that best matches the scenario's mechanism.`,
    `- confidence_scores: 1-10 per overridden driver — 10 when the user stated it explicitly, low when you inferred it.`,
    `- macro_thesis: one sentence. cfo_pushback: the single most challengeable assumption. consistency_flags: internal tensions in the scenario, empty array if none.`,
  ].join("\n");
}

export async function translateScenario(
  apiKey: string,
  scenario: string,
  company: CompanyData,
  base: BaseCase,
): Promise<Overrides> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const ask = async (extra?: string) => {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt(company, base),
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: extra ? `${scenario}\n\n(Previous attempt failed validation: ${extra} — return a corrected override object.)` : scenario,
        },
      ],
    } as Parameters<typeof client.messages.create>[0]);
    const text = (res as { content: Array<{ type: string; text?: string }> }).content.find(
      (b) => b.type === "text",
    )?.text;
    if (!text) throw new Error("Model returned no text content");
    return JSON.parse(text) as unknown;
  };

  // one retry on schema mismatch, per spec
  let raw = await ask();
  let parsed = OverridesSchema.safeParse(raw);
  if (!parsed.success) {
    raw = await ask(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    parsed = OverridesSchema.safeParse(raw);
  }
  if (!parsed.success) {
    throw new Error(`Model output failed schema validation twice: ${parsed.error.message}`);
  }
  return parsed.data; // clamped inside the engine before use
}
